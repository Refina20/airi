/**
 * Expression control types for the bridge between OpenClaw agent and Airi WebUI
 */

/**
 * Blend mode for expression parameters
 */
export type ExpressionBlendMode = 'Add' | 'Multiply' | 'Overwrite'

/**
 * A single expression parameter entry
 */
export interface ExpressionEntry {
  /** Human-readable name (Expression name or raw parameter ID) */
  name: string
  /** Live2D parameter ID (e.g. "ParamWatermarkOFF") */
  parameterId: string
  /** How this value is applied on top of the base value */
  blend: ExpressionBlendMode
  /** Runtime value that will be applied every frame */
  currentValue: number
  /** Application-level default (may be overridden by the user via saveDefaults) */
  defaultValue: number
  /** Original default baked into the moc3 / exp3 file */
  modelDefault: number
  /**
   * The exp3-specified target value for this parameter
   * Used by toggle to know what value to set when activating
   */
  targetValue: number
}

/**
 * Named expression group loaded from model3.json / exp3.json
 */
export interface ExpressionGroupDefinition {
  /** Expression name as declared in model3.json Expressions[].Name */
  name: string
  /** Parameter entries that belong to this expression group */
  parameters: {
    parameterId: string
    blend: ExpressionBlendMode
    value: number
  }[]
}

/**
 * Serializable snapshot returned to the LLM
 */
export interface ExpressionState {
  name: string
  value: number
  default: number
  active: boolean
}

/**
 * Unified tool result envelope
 */
export interface ExpressionToolResult {
  success: boolean
  error?: string
  state?: ExpressionState | ExpressionState[]
  available?: string[]
}

/**
 * HTTP request body for expression_set
 */
export interface ExpressionSetRequest {
  name: string
  value: boolean | number
  duration?: number
}

/**
 * HTTP request body for expression_toggle
 */
export interface ExpressionToggleRequest {
  name: string
  duration?: number
}

/**
 * WebSocket message types for expression changes
 */
export type WebSocketMessageType
  = | 'expression_change'
    | 'expression_reset'
    | 'expression_save_defaults'
    | 'model_loaded'
    | 'model_unloaded'
    | 'register_model'

/**
 * WebSocket message payload
 */
export interface WebSocketMessage {
  type: WebSocketMessageType
  payload: Record<string, any>
}
