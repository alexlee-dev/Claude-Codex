export interface Transcript<TMessage = unknown> {
  getMessages(): readonly TMessage[]
  append(message: TMessage): void
}
