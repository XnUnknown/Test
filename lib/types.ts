import { Timestamp } from 'firebase/firestore'

export type UserRole = 'admin' | 'student'

export interface User {
  uid: string
  username: string
  displayName: string
  role: UserRole
  email: string
  createdAt: Timestamp
  createdBy?: string
}

export type QuestionType = 'single' | 'multiple' | 'true-false'
export type EndingMode = 'immediate' | 'negative'
export type SubmissionStatus = 'in-progress' | 'submitted' | 'auto-submitted'

export interface QuestionOption {
  id: string
  text: string
}

export interface Question {
  id: string
  testId: string
  sectionId: string
  type: QuestionType
  text: string
  options: QuestionOption[]
  correctAnswers: string[]
  marks: number
  negativeMarks: number
  order: number
  explanation?: string
}

export interface QuestionForStudent extends Omit<Question, 'correctAnswers' | 'explanation'> {}

export interface Section {
  id: string
  testId: string
  title: string
  description: string
  order: number
  createdAt: Timestamp
}

export interface Test {
  id: string
  title: string
  description: string
  duration: number
  endingMode: EndingMode
  isPublished: boolean
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
  totalMarks: number
  passingMarks: number
  instructions?: string
}

export interface AnswerEntry {
  selectedOptions: string[]
  timeSpent: number
  lastVisitedAt: Timestamp
}

export interface Submission {
  id: string
  testId: string
  studentId: string
  studentUsername: string
  startedAt: Timestamp
  submittedAt: Timestamp | null
  status: SubmissionStatus
  answers: Record<string, AnswerEntry>
  timeOverflow: number
}

export interface QuestionResult {
  isCorrect: boolean
  isPartiallyCorrect: boolean
  marksObtained: number
  timeSpent: number
  selectedOptions: string[]
  correctOptions: string[]
}

export interface SectionResult {
  totalMarks: number
  obtainedMarks: number
  questionsAttempted: number
  totalQuestions: number
  sectionTitle: string
}

export interface Result {
  id: string
  testId: string
  testTitle: string
  studentId: string
  studentUsername: string
  totalMarks: number
  obtainedMarks: number
  percentage: number
  questionResults: Record<string, QuestionResult>
  sectionResults: Record<string, SectionResult>
  totalTimeSpent: number
  calculatedAt: Timestamp
  submittedAt: Timestamp
}

export interface JSONImportSchema {
  sections: {
    id?: string
    title: string
    description?: string
    questions: {
      type: QuestionType
      text: string
      options: { id: string; text: string }[]
      correctAnswers: string[]
      marks: number
      negativeMarks?: number
      explanation?: string
    }[]
  }[]
}
