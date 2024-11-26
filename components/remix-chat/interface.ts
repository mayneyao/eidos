export type User = {
    id: string
    email: string
    password: string | null
}

export type Chat = {
    id: string
    createdAt: Date
    title: string
    userId: string
}

export type Message = {
    id: string
    chatId: string
    role: string
    content: any
    createdAt: Date
}

export type Vote = {
    chatId: string
    messageId: string
    isUpvoted: boolean
}

export type Document = {
    id: string
    createdAt: Date
    title: string
    content: string | null
    userId: string
}

export type Suggestion = {
    id: string
    documentId: string
    documentCreatedAt: Date
    originalText: string
    suggestedText: string
    description: string | null
    isResolved: boolean
    userId: string
    createdAt: Date
}
