/**
 * Error taxonomy for COB/1.
 *
 * Every failure carries a stable machine-readable `code`. Callers are expected to
 * switch on the code, never on the message. Messages are for humans and may change.
 */

/** Base class for every error this package throws deliberately. */
export class CobError extends Error {
  /**
   * @param {string} code stable, machine-readable identifier
   * @param {string} message human-readable explanation
   * @param {Record<string, unknown>} [details] structured context for debugging
   */
  constructor(code, message, details = undefined) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/** A value could not be reduced to canonical JSON. */
export class CanonicalizationError extends CobError {
  constructor(message, details) {
    super('COB_CANONICALIZATION', message, details);
  }
}

/** A message or field is structurally wrong (missing, wrong type, out of range). */
export class ValidationError extends CobError {
  constructor(message, details) {
    super('COB_VALIDATION', message, details);
  }
}

/** A signature is absent, malformed, or does not verify. */
export class SignatureError extends CobError {
  constructor(message, details) {
    super('COB_SIGNATURE', message, details);
  }
}

/** An envelope is outside its validity window. */
export class ExpiredError extends CobError {
  constructor(message, details) {
    super('COB_EXPIRED', message, details);
  }
}

/** A chain, asset, or amount is refused by the active policy. */
export class PolicyError extends CobError {
  constructor(message, details) {
    super('COB_POLICY', message, details);
  }
}

/** A payment state transition is not allowed. */
export class StateError extends CobError {
  constructor(message, details) {
    super('COB_STATE', message, details);
  }
}
