"use client"

import { useRef, useState } from "react"
import { useEveAgent } from "eve/react"
import {
  BotIcon,
  HistoryIcon,
  MenuIcon,
  MessageSquareIcon,
  PlusIcon,
  SendIcon,
  SparklesIcon,
  SquareIcon,
  XIcon,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import useSWR from "swr"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Separator } from "@/components/ui/separator"

interface ChatSummary {
  id: string
  title: string
  workflowSessionId: string | null
  createdAt: string
  updatedAt: string
  draft?: boolean
}

const suggestions = [
  "Turn my rough launch idea into a one-week plan",
  "Help me decide what to cut from an MVP",
  "Draft a concise update for my team",
]

const fetcher = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error("Could not load conversation history.")
  return response.json()
}

function newDraft(): ChatSummary {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: "New conversation",
    workflowSessionId: null,
    createdAt: now,
    updatedAt: now,
    draft: true,
  }
}

function relativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime()
  if (elapsed < 60_000) return "now"
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h`
  return `${Math.floor(elapsed / 86_400_000)}d`
}

function titleFromPrompt(prompt: string) {
  const title = prompt.replace(/\s+/g, " ").trim()
  return title.length > 46 ? `${title.slice(0, 43)}...` : title
}

export function ChatWorkspace() {
  const { data: chats = [], error, isLoading, mutate } = useSWR<ChatSummary[]>(
    "/api/chats",
    fetcher
  )
  const [selectedChat, setSelectedChat] = useState<ChatSummary>(newDraft)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const createNewChat = () => {
    setSelectedChat(newDraft())
    setSidebarOpen(false)
  }

  const updateSelectedChat = (chat: ChatSummary) => {
    setSelectedChat((current) => (current.id === chat.id ? chat : current))
    void mutate()
  }

  return (
    <main className="flex h-dvh min-h-0 bg-background text-foreground">
      {sidebarOpen ? (
        <button
          aria-label="Close conversation history"
          className="fixed inset-0 bg-foreground/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
          type="button"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 flex w-72 shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <SparklesIcon className="size-4" aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <span className="font-sans text-sm font-semibold">Orbit</span>
              <span className="font-mono text-[11px] text-sidebar-foreground/55">
                powered by eve
              </span>
            </div>
          </div>
          <Button
            aria-label="Close sidebar"
            className="md:hidden"
            onClick={() => setSidebarOpen(false)}
            size="icon-sm"
            variant="ghost"
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>

        <div className="px-3 pb-3">
          <Button
            className="w-full justify-start bg-sidebar-foreground text-sidebar hover:bg-sidebar-foreground/90"
            onClick={createNewChat}
          >
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            New conversation
          </Button>
        </div>

        <Separator className="bg-sidebar-foreground/10" />

        <nav
          aria-label="Conversation history"
          className="rainbow-surface mx-2 my-3 min-h-0 flex-1 overflow-y-auto rounded-xl px-2 py-4"
        >
          <div className="flex items-center gap-2 px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider">
            <HistoryIcon className="size-3.5 text-sidebar-foreground/70" aria-hidden="true" />
            <span className="rainbow-text">Recent</span>
          </div>
          <div className="flex flex-col gap-1">
            {isLoading ? (
              <p className="px-2 py-3 text-sm text-sidebar-foreground/45">Loading history...</p>
            ) : null}
            {error ? (
              <p className="px-2 py-3 text-sm text-sidebar-foreground/60">History is unavailable.</p>
            ) : null}
            {!isLoading && !error && chats.length === 0 ? (
              <p className="px-2 py-3 text-sm leading-6 text-sidebar-foreground/45">
                Your conversations will appear here after the first message.
              </p>
            ) : null}
            {chats.map((chat) => {
              const active = selectedChat.id === chat.id
              return (
                <button
                  aria-current={active ? "page" : undefined}
                  className={`group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors ${
                    active
                      ? "rainbow-edge bg-sidebar-foreground/10 text-sidebar-foreground"
                      : "text-sidebar-foreground/65 hover:bg-sidebar-foreground/5 hover:text-sidebar-foreground"
                  }`}
                  key={chat.id}
                  onClick={() => {
                    setSelectedChat(chat)
                    setSidebarOpen(false)
                  }}
                  type="button"
                >
                  <MessageSquareIcon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm">{chat.title}</span>
                  <span className="font-mono text-[10px] text-sidebar-foreground/35">
                    {relativeTime(chat.updatedAt)}
                  </span>
                </button>
              )
            })}
          </div>
        </nav>

        <div className="border-t border-sidebar-foreground/10 p-4">
          <div className="flex items-center gap-2 text-xs text-sidebar-foreground/50">
            <span className="size-1.5 rounded-full bg-primary" />
            Durable sessions · 30 day window
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-card">
        <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              aria-label="Open conversation history"
              className="md:hidden"
              onClick={() => setSidebarOpen(true)}
              size="icon-sm"
              variant="ghost"
            >
              <MenuIcon aria-hidden="true" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate font-sans text-sm font-semibold">{selectedChat.title}</h1>
              <p className="text-xs text-muted-foreground">Resumable eve session</p>
            </div>
          </div>
          <Badge variant="secondary">
            <span className="size-1.5 rounded-full bg-primary" />
            Live
          </Badge>
        </header>

        <ChatThread
          chat={selectedChat}
          key={selectedChat.id}
          onChatUpdated={updateSelectedChat}
          onHistoryChanged={() => void mutate()}
        />
      </section>
    </main>
  )
}

function ChatThread({
  chat,
  onChatUpdated,
  onHistoryChanged,
}: {
  chat: ChatSummary
  onChatUpdated: (chat: ChatSummary) => void
  onHistoryChanged: () => void
}) {
  const [input, setInput] = useState("")
  const persistedSessionId = useRef(chat.workflowSessionId)
  const agent = useEveAgent({
    initialSession: chat.workflowSessionId
      ? { sessionId: chat.workflowSessionId, streamIndex: 0 }
      : undefined,
    resume: Boolean(chat.workflowSessionId),
    onSessionChange(session) {
      if (!session || persistedSessionId.current === session.sessionId) return
      persistedSessionId.current = session.sessionId
      const updatedChat = {
        ...chat,
        workflowSessionId: session.sessionId,
        draft: false,
        updatedAt: new Date().toISOString(),
      }
      onChatUpdated(updatedChat)
      void fetch("/api/chats", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chat.id,
          workflowSessionId: session.sessionId,
        }),
      }).then(onHistoryChanged)
    },
    onFinish: onHistoryChanged,
  })

  const isBusy = agent.status === "submitted" || agent.status === "streaming"
  const isResuming = agent.status === "resuming"

  const submitMessage = async () => {
    const prompt = input.trim()
    if (!prompt || isResuming) return

    setInput("")

    if (chat.draft) {
      const title = titleFromPrompt(prompt)
      const response = await fetch("/api/chats", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: chat.id, title }),
      })
      if (!response.ok) {
        setInput(prompt)
        return
      }
      const persisted = (await response.json()) as ChatSummary
      onChatUpdated(persisted)
    }

    await agent.send(prompt, isBusy ? { turnPolicy: "steer" } : undefined)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageScrollerProvider>
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8 md:py-12">
              {agent.data.messages.length === 0 ? (
                <div className="flex min-h-[55vh] flex-col items-center justify-center gap-6 text-center">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                    <BotIcon className="size-6" aria-hidden="true" />
                  </div>
                  <div className="flex max-w-lg flex-col gap-2">
                    <h2 className="text-balance font-sans text-2xl font-semibold tracking-tight">
                      What are we working through?
                    </h2>
                    <p className="text-pretty text-sm leading-6 text-muted-foreground">
                      Start a thread, leave, and come back later. The eve workflow keeps the session durable.
                    </p>
                  </div>
                  <div className="flex w-full max-w-lg flex-col gap-2">
                    {suggestions.map((suggestion) => (
                      <button
                        className="rounded-xl border bg-background px-4 py-3 text-left text-sm transition-colors hover:bg-muted"
                        key={suggestion}
                        onClick={() => setInput(suggestion)}
                        type="button"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {agent.data.messages.map((message, messageIndex) => {
                const isUser = message.role === "user"
                return (
                  <MessageScrollerItem
                    key={message.id}
                    scrollAnchor={messageIndex === agent.data.messages.length - 1}
                  >
                    <Message align={isUser ? "end" : "start"}>
                      {!isUser ? (
                        <MessageAvatar>
                          <BotIcon className="size-4" aria-hidden="true" />
                        </MessageAvatar>
                      ) : null}
                      <MessageContent>
                        <div
                          className={
                            isUser
                              ? "max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-primary-foreground"
                              : "max-w-[92%] rounded-2xl rounded-bl-md bg-muted px-4 py-3 text-foreground"
                          }
                        >
                          {message.parts.map((part, partIndex) => {
                            if (part.type === "text") {
                              return isUser ? (
                                <p
                                  className="whitespace-pre-wrap text-sm leading-6"
                                  key={`${message.id}-text-${partIndex}`}
                                >
                                  {part.text}
                                </p>
                              ) : (
                                <ReactMarkdown
                                  components={{
                                    h1: ({ children }) => (
                                      <h3 className="mb-3 text-base font-semibold">{children}</h3>
                                    ),
                                    h2: ({ children }) => (
                                      <h3 className="mb-3 text-base font-semibold">{children}</h3>
                                    ),
                                    h3: ({ children }) => (
                                      <h3 className="mb-3 text-base font-semibold">{children}</h3>
                                    ),
                                    p: ({ children }) => (
                                      <p className="mb-3 text-sm leading-6 last:mb-0">{children}</p>
                                    ),
                                    ol: ({ children }) => (
                                      <ol className="mb-3 flex list-decimal flex-col gap-2 pl-5 text-sm leading-6 last:mb-0">
                                        {children}
                                      </ol>
                                    ),
                                    ul: ({ children }) => (
                                      <ul className="mb-3 flex list-disc flex-col gap-1 pl-5 text-sm leading-6 last:mb-0">
                                        {children}
                                      </ul>
                                    ),
                                    code: ({ children }) => (
                                      <code className="rounded-md bg-card px-1.5 py-0.5 font-mono text-xs">
                                        {children}
                                      </code>
                                    ),
                                  }}
                                  key={`${message.id}-text-${partIndex}`}
                                  remarkPlugins={[remarkGfm]}
                                >
                                  {part.text}
                                </ReactMarkdown>
                              )
                            }
                            if (part.type === "dynamic-tool") {
                              return (
                                <div
                                  className="flex items-center gap-2 text-xs text-muted-foreground"
                                  key={`${message.id}-tool-${partIndex}`}
                                >
                                  <SparklesIcon className="size-3.5" aria-hidden="true" />
                                  Agent action · {part.state.replaceAll("-", " ")}
                                </div>
                              )
                            }
                            return null
                          })}
                        </div>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                )
              })}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <div className="shrink-0 bg-card px-4 pb-4 md:px-8 md:pb-6">
        <form
          className="mx-auto flex max-w-3xl flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void submitMessage()
          }}
        >
          <InputGroup className="min-h-24 rounded-2xl bg-background shadow-[0_8px_30px_rgb(17_19_24/0.08)]">
            <InputGroupTextarea
              aria-label="Message Orbit"
              className="min-h-16 px-3 pt-3 text-sm"
              disabled={isResuming}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
              placeholder={isResuming ? "Reconnecting to this session..." : "Ask Orbit anything..."}
              value={input}
            />
            <InputGroupAddon align="block-end" className="justify-between">
              <span className="font-mono text-[11px] text-muted-foreground">
                {agent.status === "ready" ? "Enter to send" : agent.status}
              </span>
              {isBusy ? (
                <InputGroupButton
                  aria-label="Stop response"
                  onClick={() => void agent.cancel()}
                  size="icon-sm"
                  type="button"
                  variant="secondary"
                >
                  <SquareIcon aria-hidden="true" />
                </InputGroupButton>
              ) : (
                <InputGroupButton
                  aria-label="Send message"
                  disabled={!input.trim() || isResuming}
                  size="icon-sm"
                  type="submit"
                  variant="default"
                >
                  <SendIcon aria-hidden="true" />
                </InputGroupButton>
              )}
            </InputGroupAddon>
          </InputGroup>
          <p className="px-2 text-center text-[11px] text-muted-foreground">
            Public demo — do not share confidential information.
          </p>
        </form>
      </div>
    </div>
  )
}
