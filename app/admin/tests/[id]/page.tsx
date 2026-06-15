'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  doc, getDoc, updateDoc, collection, getDocs, addDoc,
  deleteDoc, writeBatch, query, where, serverTimestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Test, Section, Question, JSONImportSchema } from '@/lib/types'
import { generateTestLink } from '@/lib/utils'
import Link from 'next/link'
import { v4 as uuidv4 } from 'uuid'

type Tab = 'overview' | 'sections' | 'questions' | 'import'

export default function TestDetailPage() {
  const { id: testId } = useParams<{ id: string }>()
  const router = useRouter()
  const [test, setTest] = useState<Test | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  // Section form
  const [newSectionTitle, setNewSectionTitle] = useState('')
  const [newSectionDesc, setNewSectionDesc] = useState('')
  const [addingSection, setAddingSection] = useState(false)

  // Import
  const [importJson, setImportJson] = useState('')
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadAll()
  }, [testId])

  async function loadAll() {
    try {
      const [testSnap, sectionsSnap, questionsSnap] = await Promise.all([
        getDoc(doc(db, 'tests', testId)),
        getDocs(query(collection(db, 'sections'), where('testId', '==', testId))),
        getDocs(query(collection(db, 'questions'), where('testId', '==', testId))),
      ])
      if (!testSnap.exists()) { router.push('/admin/tests'); return }
      setTest({ id: testSnap.id, ...testSnap.data() } as Test)
      setSections(
        sectionsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Section))
          .sort((a, b) => a.order - b.order)
      )
      setQuestions(questionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Question)))
    } catch (err: any) {
      console.error('Failed to load test:', err)
    } finally {
      setLoading(false)
    }
  }

  async function togglePublish() {
    if (!test) return
    setSaving(true)
    await updateDoc(doc(db, 'tests', testId), {
      isPublished: !test.isPublished,
      updatedAt: serverTimestamp()
    })
    setTest(prev => prev ? { ...prev, isPublished: !prev.isPublished } : null)
    setSaving(false)
  }

  async function addSection() {
    if (!newSectionTitle.trim()) return
    setAddingSection(true)
    const ref = await addDoc(collection(db, 'sections'), {
      testId,
      title: newSectionTitle.trim(),
      description: newSectionDesc.trim(),
      order: sections.length,
      createdAt: serverTimestamp(),
    })
    setSections(prev => [...prev, {
      id: ref.id, testId, title: newSectionTitle.trim(),
      description: newSectionDesc.trim(), order: sections.length
    } as Section])
    setNewSectionTitle('')
    setNewSectionDesc('')
    setAddingSection(false)
  }

  async function deleteSection(sectionId: string) {
    if (!confirm('Delete this section and all its questions?')) return
    const batch = writeBatch(db)
    batch.delete(doc(db, 'sections', sectionId))
    questions.filter(q => q.sectionId === sectionId).forEach(q => batch.delete(doc(db, 'questions', q.id)))
    await batch.commit()
    setSections(prev => prev.filter(s => s.id !== sectionId))
    setQuestions(prev => prev.filter(q => q.sectionId !== sectionId))
  }

  async function deleteQuestion(qId: string) {
    if (!confirm('Delete this question?')) return
    await deleteDoc(doc(db, 'questions', qId))
    const deletedQ = questions.find(q => q.id === qId)
    setQuestions(prev => prev.filter(q => q.id !== qId))
    if (deletedQ) {
      const newTotal = (test?.totalMarks || 0) - deletedQ.marks
      await updateDoc(doc(db, 'tests', testId), { totalMarks: newTotal })
      setTest(prev => prev ? { ...prev, totalMarks: newTotal } : null)
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setImportJson(text)
  }

  async function handleImport() {
    setImportError('')
    setImportSuccess('')
    if (!importJson.trim()) { setImportError('Paste or upload a JSON file first.'); return }
    let data: JSONImportSchema
    try {
      data = JSON.parse(importJson)
    } catch {
      setImportError('Invalid JSON format.')
      return
    }
    if (!data.sections || !Array.isArray(data.sections)) {
      setImportError('JSON must have a "sections" array.')
      return
    }
    setImporting(true)
    try {
      const batch = writeBatch(db)
      let addedQuestions = 0
      let totalNewMarks = 0
      const newSections: Section[] = []
      const newQuestions: Question[] = []

      for (let si = 0; si < data.sections.length; si++) {
        const sec = data.sections[si]
        if (!sec.title) { setImportError(`Section ${si + 1} missing title.`); return }

        // Reuse existing section with same title or create
        let sectionId = sections.find(s => s.title.toLowerCase() === sec.title.toLowerCase())?.id
        if (!sectionId) {
          const sRef = doc(collection(db, 'sections'))
          sectionId = sRef.id
          batch.set(sRef, {
            testId, title: sec.title, description: sec.description || '',
            order: sections.length + si, createdAt: serverTimestamp(),
          })
          newSections.push({ id: sectionId, testId, title: sec.title, description: sec.description || '', order: sections.length + si } as Section)
        }

        for (let qi = 0; qi < (sec.questions || []).length; qi++) {
          const q = sec.questions[qi]
          if (!q.text || !q.options || !q.correctAnswers) {
            setImportError(`Section "${sec.title}", question ${qi + 1} is missing required fields.`)
            return
          }
          const qRef = doc(collection(db, 'questions'))
          const qData = {
            testId, sectionId,
            type: q.type || 'single',
            text: q.text,
            options: q.options,
            correctAnswers: q.correctAnswers,
            marks: q.marks || 1,
            negativeMarks: q.negativeMarks || 0,
            explanation: q.explanation || '',
            order: questions.filter(x => x.sectionId === sectionId).length + qi,
          }
          batch.set(qRef, qData)
          newQuestions.push({ id: qRef.id, ...qData } as Question)
          totalNewMarks += q.marks || 1
          addedQuestions++
        }
      }

      const newTotal = (test?.totalMarks || 0) + totalNewMarks
      batch.update(doc(db, 'tests', testId), { totalMarks: newTotal, updatedAt: serverTimestamp() })
      await batch.commit()

      setSections(prev => [...prev, ...newSections.filter(ns => !prev.find(s => s.id === ns.id))])
      setQuestions(prev => [...prev, ...newQuestions])
      setTest(prev => prev ? { ...prev, totalMarks: newTotal } : null)
      setImportJson('')
      setImportSuccess(`Imported ${addedQuestions} questions across ${data.sections.length} sections.`)
    } catch (err: any) {
      setImportError('Import failed: ' + err.message)
    } finally {
      setImporting(false)
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(generateTestLink(testId))
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  }
  if (!test) return null

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'sections', label: `Sections (${sections.length})` },
    { key: 'questions', label: `Questions (${questions.length})` },
    { key: 'import', label: 'Import Questions' },
  ]

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <Link href="/admin/tests" className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{test.title}</h1>
        <span className={test.isPublished ? 'badge-green' : 'badge-yellow'}>
          {test.isPublished ? 'Published' : 'Draft'}
        </span>
      </div>
      <p className="text-gray-500 text-sm mb-6 ml-8">{test.description}</p>

      <div className="flex items-center gap-2 mb-6 ml-8">
        <button onClick={togglePublish} disabled={saving}
          className={test.isPublished ? 'btn-secondary' : 'btn-primary'}>
          {saving ? 'Saving...' : test.isPublished ? 'Unpublish' : 'Publish Test'}
        </button>
        <button onClick={copyLink} className={`btn-secondary gap-1.5 ${linkCopied ? 'text-green-600' : ''}`}>
          {linkCopied ? '✓ Link Copied!' : '🔗 Copy Student Link'}
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px
              ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-6 max-w-3xl">
          <div className="card p-6 space-y-4">
            <h3 className="font-semibold text-gray-800">Test Details</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Duration</span><span className="font-medium">{test.duration > 0 ? `${test.duration} min` : 'No limit'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Ending Mode</span><span className="font-medium">{test.endingMode === 'immediate' ? 'Auto Submit' : 'Overtime'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total Marks</span><span className="font-medium">{test.totalMarks}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Passing Marks</span><span className="font-medium">{test.passingMarks}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Sections</span><span className="font-medium">{sections.length}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Questions</span><span className="font-medium">{questions.length}</span></div>
            </div>
          </div>
          {test.instructions && (
            <div className="card p-6">
              <h3 className="font-semibold text-gray-800 mb-3">Instructions</h3>
              <p className="text-sm text-gray-600 whitespace-pre-line">{test.instructions}</p>
            </div>
          )}
          <div className="card p-6 col-span-2">
            <h3 className="font-semibold text-gray-800 mb-3">Share with Students</h3>
            <div className="flex items-center gap-3">
              <input
                readOnly
                className="input flex-1 font-mono text-xs bg-gray-50"
                value={generateTestLink(testId)}
              />
              <button onClick={copyLink} className={`btn-primary text-sm ${linkCopied ? 'bg-green-600' : ''}`}>
                {linkCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'sections' && (
        <div className="max-w-3xl space-y-4">
          {sections.length === 0 && (
            <div className="card p-8 text-center text-gray-400 text-sm">No sections yet. Add sections below.</div>
          )}
          {sections.map((sec) => (
            <div key={sec.id} className="card p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{sec.title}</p>
                {sec.description && <p className="text-sm text-gray-500">{sec.description}</p>}
                <p className="text-xs text-gray-400 mt-1">{questions.filter(q => q.sectionId === sec.id).length} questions</p>
              </div>
              <button onClick={() => deleteSection(sec.id)} className="btn-danger text-xs">Delete</button>
            </div>
          ))}
          <div className="card p-5 border-2 border-dashed border-gray-200">
            <h3 className="font-medium text-gray-700 mb-3">Add Section</h3>
            <div className="space-y-3">
              <input className="input" placeholder="Section title (e.g. Mathematics)" value={newSectionTitle} onChange={e => setNewSectionTitle(e.target.value)} />
              <input className="input" placeholder="Description (optional)" value={newSectionDesc} onChange={e => setNewSectionDesc(e.target.value)} />
              <button onClick={addSection} disabled={addingSection || !newSectionTitle.trim()} className="btn-primary text-sm">
                {addingSection ? 'Adding...' : 'Add Section'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'questions' && (
        <div className="max-w-4xl">
          {sections.map(sec => {
            const secQs = questions.filter(q => q.sectionId === sec.id).sort((a, b) => a.order - b.order)
            return (
              <div key={sec.id} className="mb-8">
                <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  {sec.title}
                  <span className="badge-blue">{secQs.length} questions</span>
                </h3>
                {secQs.length === 0 ? (
                  <div className="card p-4 text-sm text-gray-400 text-center">No questions in this section. Use "Import Questions" tab.</div>
                ) : (
                  <div className="space-y-3">
                    {secQs.map((q, qi) => (
                      <div key={q.id} className="card p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-800">
                              <span className="text-gray-400 mr-2">Q{qi + 1}.</span>
                              {q.text}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {q.options.map(opt => (
                                <span key={opt.id} className={`text-xs px-2 py-1 rounded ${q.correctAnswers.includes(opt.id) ? 'bg-green-100 text-green-700 font-medium' : 'bg-gray-100 text-gray-600'}`}>
                                  {q.correctAnswers.includes(opt.id) ? '✓ ' : ''}{opt.text}
                                </span>
                              ))}
                            </div>
                            <div className="flex gap-3 mt-2 text-xs text-gray-400">
                              <span>+{q.marks} marks</span>
                              {q.negativeMarks > 0 && <span>-{q.negativeMarks} negative</span>}
                              <span className="capitalize">{q.type}</span>
                            </div>
                          </div>
                          <button onClick={() => deleteQuestion(q.id)} className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {sections.length === 0 && (
            <div className="card p-8 text-center text-gray-400">Add sections first, then import questions.</div>
          )}
        </div>
      )}

      {tab === 'import' && (
        <div className="max-w-3xl space-y-5">
          <div className="card p-6">
            <h3 className="font-semibold text-gray-800 mb-2">Import Questions via JSON</h3>
            <p className="text-sm text-gray-500 mb-4">
              Upload or paste JSON following the schema below. Sections that match existing section names will reuse them.
            </p>

            <div className="bg-gray-900 rounded-lg p-4 text-xs font-mono text-green-400 mb-4 overflow-auto max-h-64">
{`{
  "sections": [
    {
      "title": "Mathematics",
      "description": "Algebra and calculus questions",
      "questions": [
        {
          "type": "single",
          "text": "What is 2 + 2?",
          "options": [
            { "id": "a", "text": "3" },
            { "id": "b", "text": "4" },
            { "id": "c", "text": "5" }
          ],
          "correctAnswers": ["b"],
          "marks": 1,
          "negativeMarks": 0.25,
          "explanation": "2 + 2 = 4"
        },
        {
          "type": "multiple",
          "text": "Which are prime numbers?",
          "options": [
            { "id": "a", "text": "2" },
            { "id": "b", "text": "4" },
            { "id": "c", "text": "7" }
          ],
          "correctAnswers": ["a", "c"],
          "marks": 2,
          "negativeMarks": 0
        }
      ]
    }
  ]
}`}
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Upload JSON File</label>
                <input ref={fileRef} type="file" accept=".json" onChange={handleFileUpload} className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
              </div>

              <div>
                <label className="label">Or Paste JSON</label>
                <textarea
                  className="input font-mono text-xs"
                  rows={10}
                  value={importJson}
                  onChange={e => setImportJson(e.target.value)}
                  placeholder="Paste your JSON here..."
                />
              </div>

              {importError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{importError}</div>
              )}
              {importSuccess && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">✓ {importSuccess}</div>
              )}

              <button onClick={handleImport} disabled={importing || !importJson.trim()} className="btn-primary">
                {importing ? 'Importing...' : 'Import Questions'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
