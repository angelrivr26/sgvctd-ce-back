export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ProviderError extends Error {
  constructor(message, { uncertain = false, retryable = true } = {}) {
    super(message);
    this.uncertain = uncertain;
    this.retryable = retryable;
  }
}
