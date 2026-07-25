import { type KeyboardEvent, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { AiMateMessage } from "../../domain/types";
import { useAiMate } from "./AiMateProvider";
import { AiMateCharacter } from "./components/AiMateCharacter";

function formatTime(isoDate: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoDate));
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M15 2c1.3 7.5 4.6 10.8 12 12-7.4 1.3-10.7 4.7-12 12C13.7 18.7 10.4 15.3 3 14 10.4 12.8 13.7 9.5 15 2Z" />
      <path d="M26 3c.4 2.6 1.5 3.7 4 4-2.5.5-3.6 1.6-4 4-.5-2.4-1.6-3.5-4-4 2.4-.3 3.5-1.4 4-4Z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="m5 5 23 11L5 27l4-9 10-2-10-2-4-9Z" />
    </svg>
  );
}

function MessageBubble({
  message,
  retryFailed,
  closePanel,
}: {
  message: AiMateMessage;
  retryFailed: (operationId: string) => void;
  closePanel: () => void;
}) {
  if (message.role === "user") {
    return (
      <article className="ai-message ai-message--user" aria-label="내 메시지">
        <div className="ai-bubble ai-bubble--user">
          <p>{message.text}</p>
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
        </div>
      </article>
    );
  }
  return (
    <article className="ai-message ai-message--assistant" aria-label="AI Mate 메시지">
      <AiMateCharacter size={40} />
      <div className="ai-bubble ai-bubble--assistant">
        <p>{message.text}</p>
        <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
        {message.actions?.map((action) =>
          action.href ? (
            <Link
              key={action.label}
              className="ai-message-action"
              to={action.href}
              onClick={closePanel}
            >
              {action.label}
            </Link>
          ) : (
            <button
              key={action.label}
              className="ai-message-action"
              type="button"
              onClick={() => message.operationId && retryFailed(message.operationId)}
            >
              {action.label}
            </button>
          ),
        )}
      </div>
    </article>
  );
}

export function AiMateLayer({ showCoachmark }: { showCoachmark: boolean }) {
  const {
    isOpen,
    setOpen,
    messages,
    draft,
    setDraft,
    isResponding,
    adjustmentRemaining,
    sendMessage,
    retryFailed,
  } = useAiMate();
  const launcherRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      window.requestAnimationFrame(() => closeRef.current?.focus());
    } else {
      launcherRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [isOpen, isResponding, messages]);

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      isComposingRef.current ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    ) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {!isOpen && (
        <div className="ai-mate-launcher">
          {showCoachmark && (
            <div className="ai-coachmark" role="status">
              AI Mate에서 이번 주 계획을 만들어보세요
            </div>
          )}
          <button
            ref={launcherRef}
            className="ai-fab"
            type="button"
            aria-label="AI Mate 열기"
            onClick={() => setOpen(true)}
          >
            <AiMateCharacter size={68} />
          </button>
        </div>
      )}
      {isOpen && (
        <div
          className="ai-modal-blocker"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <section
            className="ai-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-mate-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
          >
            <div className="ai-drag-handle" aria-hidden="true" />
            <header className="ai-dialog__header">
              <div className="ai-dialog__title">
                <SparkleIcon />
                <h2 id="ai-mate-title">AI Mate</h2>
              </div>
              <div className="ai-dialog__tools">
                <span aria-live="polite">조정 잔여 {adjustmentRemaining}회</span>
                <button
                  ref={closeRef}
                  type="button"
                  aria-label="AI Mate 닫기"
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
              </div>
            </header>
            <div
              ref={logRef}
              className="ai-conversation"
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
            >
              {messages.length === 0 && (
                <div className="ai-empty">
                  <AiMateCharacter size={44} />
                  <p>
                    무엇을 같이 정리해볼까요? 이번 주 계획 생성이나 계획 조정을 요청할 수
                    있어요.
                  </p>
                </div>
              )}
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  retryFailed={retryFailed}
                  closePanel={() => setOpen(false)}
                />
              ))}
              {isResponding && (
                <article
                  className="ai-message ai-message--assistant"
                  aria-label="AI Mate가 답변을 준비하고 있습니다"
                >
                  <AiMateCharacter size={40} />
                  <div className="ai-bubble ai-bubble--assistant ai-loading">
                    <span>답변을 준비하고 있어요</span>
                    <span className="ai-loading__dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                </article>
              )}
            </div>
            <form
              className="ai-composer"
              onSubmit={(event) => {
                if (isComposingRef.current) {
                  event.preventDefault();
                  return;
                }
                sendMessage(event);
              }}
            >
              <textarea
                rows={1}
                value={draft}
                placeholder="메시지를 입력하세요..."
                aria-label="AI Mate 메시지"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onComposerKeyDown}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={() => {
                  isComposingRef.current = false;
                }}
              />
              <button
                type="submit"
                aria-label="메시지 보내기"
                disabled={!draft.trim() || isResponding}
              >
                <SendIcon />
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
