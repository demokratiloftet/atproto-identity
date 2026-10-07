export interface AccountInput {
  handle: string;
  password?: string;
  [key: string]: unknown;
}
export interface ProvisionContext {
  provider: string;
}
export interface Provisioner {
  domain?: string;
  choices?(context: ProvisionContext): Array<{ domain: string }>;
  suggest?(
    context: ProvisionContext,
  ): Array<{ domain: string; handle: string }>;
  validate(input: unknown, context?: ProvisionContext): void;
  create(
    input: AccountInput,
    context?: ProvisionContext,
  ): Promise<{ did: string; handle: string }>;
}
export interface Namespace {
  domain: string;
  providers: string[];
  adapter: Provisioner;
}

export function accountInput(input: unknown): AccountInput {
  if (
    !input ||
    typeof input !== "object" ||
    !("handle" in input) ||
    typeof input.handle !== "string" ||
    ("password" in input &&
      input.password !== undefined &&
      typeof input.password !== "string")
  ) {
    throw Object.assign(
      new Error("Handle and optional password must be strings"),
      { status: 400 },
    );
  }
  return input as AccountInput;
}
