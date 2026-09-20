export interface ConstraintResult {
  valid: boolean;
  constraintId: string;
  reason?: string;
  metrics?: Record<string, number>;
}

export interface ConstraintValidation {
  valid: boolean;
  results: ConstraintResult[];
}
