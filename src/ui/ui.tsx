import ReactEcs, {
  UiEntity as SdkUiEntity,
  type AlignType,
  type EntityPropTypes,
  type FlexDirectionType,
  type FlexWrapType,
  type Position,
  type PositionShorthand,
  type PositionUnit,
  type UiBackgroundProps,
  type UiLabelProps,
  type UiTransformProps
} from '@dcl/sdk/react-ecs'
import { landscape } from './grip'

// Every screen imports UiEntity from here instead of the SDK. In the portrait
// grip it is the SDK element, untouched. In the landscape grip each element is
// re-expressed upright: the whole tree was authored on a canvas that the phone
// shows turned 90 CW, so drawing it upright means turning every element 90 CW:
//
//   canvas LEFT   -> screen TOP        canvas RIGHT  -> screen BOTTOM
//   canvas TOP    -> screen RIGHT      canvas BOTTOM -> screen LEFT
//
// Sizes swap, edges rotate, flex axes follow (a row of columns becomes a
// column of rows), and the pre-rotated art gets its UVs turned back so glyphs
// read left-to-right. Percentages survive because the parent's box rotates
// the same way. Nothing here knows about any particular screen.

type UiEntityProps = EntityPropTypes & { uiText?: UiLabelProps; children?: ReactEcs.JSX.ReactNode }

export function UiEntity(props: UiEntityProps): ReactEcs.JSX.Element {
  if (!landscape()) return SdkUiEntity(props)
  return SdkUiEntity({
    ...props,
    uiTransform: props.uiTransform ? rotTransform(props.uiTransform) : undefined,
    uiBackground: props.uiBackground ? rotBackground(props.uiBackground) : undefined
  })
}

// ---- transform ------------------------------------------------------------------

/** Canvas flex axis -> screen flex axis. Reversed directions absorb the
 * mirroring (canvas +y is screen -x), so justifyContent needs no change. */
const FLEX: Record<FlexDirectionType, FlexDirectionType> = {
  row: 'column',
  'row-reverse': 'column-reverse',
  column: 'row-reverse',
  'column-reverse': 'row'
}

/** The SDK's default flex direction is 'row'. */
function rowish(dir: FlexDirectionType | undefined): boolean {
  return dir === undefined || dir === 'row' || dir === 'row-reverse'
}

/** A row's cross axis is canvas y, which maps to screen -x: start and end
 * swap. A column's cross axis is canvas x -> screen y: unchanged. */
function rotAlign(align: AlignType | undefined, flip: boolean): AlignType | undefined {
  if (!flip) return align
  if (align === 'flex-start') return 'flex-end'
  if (align === 'flex-end') return 'flex-start'
  return align
}

function rotWrap(wrap: FlexWrapType | undefined, flip: boolean): FlexWrapType | undefined {
  if (!flip) return wrap
  if (wrap === 'wrap') return 'wrap-reverse'
  if (wrap === 'wrap-reverse') return 'wrap'
  return wrap
}

/** CSS shorthand ("t r b l", "v h", "t h b", "all") -> explicit box. */
function expandBox(v: PositionShorthand): Partial<Position> {
  if (typeof v === 'number') return { top: v, right: v, bottom: v, left: v }
  const parts = String(v).trim().split(/\s+/) as PositionUnit[]
  const [a, b, c, d] = parts
  if (parts.length === 1) return { top: a, right: a, bottom: a, left: a }
  if (parts.length === 2) return { top: a, right: b, bottom: a, left: b }
  if (parts.length === 3) return { top: a, right: b, bottom: c, left: b }
  return { top: a, right: b, bottom: c, left: d }
}

/** Turn a top/right/bottom/left box 90 CW: each canvas edge lands on the next
 * screen edge clockwise (left->top, top->right, right->bottom, bottom->left). */
function rotBox(v: Partial<Position> | PositionShorthand | undefined): Partial<Position> | PositionShorthand | undefined {
  if (v === undefined) return undefined
  // A uniform number is the same on every side; nothing to turn.
  if (typeof v === 'number') return v
  const box = typeof v === 'string' ? expandBox(v) : v
  const out: Partial<Position> = {}
  if (box.left !== undefined) out.top = box.left
  if (box.top !== undefined) out.right = box.top
  if (box.right !== undefined) out.bottom = box.right
  if (box.bottom !== undefined) out.left = box.bottom
  return out
}

function rotTransform(t: UiTransformProps): UiTransformProps {
  const flip = rowish(t.flexDirection)
  const out: UiTransformProps = { ...t }
  // Sizes: the box turns, so its width is the old height.
  out.width = t.height
  out.height = t.width
  out.minWidth = t.minHeight
  out.minHeight = t.minWidth
  out.maxWidth = t.maxHeight
  out.maxHeight = t.maxWidth
  // Edges.
  if (t.position !== undefined) out.position = rotBox(t.position)
  if (t.margin !== undefined) out.margin = rotBox(t.margin)
  if (t.padding !== undefined) out.padding = rotBox(t.padding)
  if (t.borderWidth !== undefined) out.borderWidth = rotBox(t.borderWidth) as UiTransformProps['borderWidth']
  if (t.borderRadius !== undefined && typeof t.borderRadius === 'object') {
    const r = t.borderRadius
    out.borderRadius = {
      topRight: r.topLeft,
      bottomRight: r.topRight,
      bottomLeft: r.bottomRight,
      topLeft: r.bottomLeft
    } as UiTransformProps['borderRadius']
  }
  if (t.borderColor !== undefined && typeof t.borderColor === 'object' && 'top' in t.borderColor) {
    const c = t.borderColor
    out.borderColor = { top: c.left, right: c.top, bottom: c.right, left: c.bottom }
  }
  // Flex axes. An unset direction is the SDK's 'row', which must become an
  // explicit column upright.
  out.flexDirection = FLEX[t.flexDirection ?? 'row']
  out.alignItems = rotAlign(t.alignItems, flip)
  out.alignContent = rotAlign(t.alignContent, flip)
  out.flexWrap = rotWrap(t.flexWrap, flip)
  // alignSelf reads the *parent's* axis, which we can't see here; nearly every
  // parent in this app is a row (the default), so treat it as one.
  out.alignSelf = rotAlign(t.alignSelf, true)
  return dropUndefined(out)
}

/** The SDK spreads props over its defaults; an explicit `undefined` for
 * width/height would otherwise override a default with nothing. */
function dropUndefined<T extends object>(obj: T): T {
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] === undefined) delete obj[key]
  }
  return obj
}

// ---- background -----------------------------------------------------------------

/** Full-texture UVs in the SDK's corner order: A bottom-left, B top-left,
 * C top-right, D bottom-right. */
const FULL_UVS = [0, 0, 0, 1, 1, 1, 1, 0]

/** Turn the sampled quad 90 CW so pre-rotated (90 CCW) art reads upright:
 * each screen corner samples what the previous corner clockwise did. */
export function rotUvs(uvs?: number[]): number[] {
  const u = uvs && uvs.length === 8 ? uvs : FULL_UVS
  // new A = old D, new B = old A, new C = old B, new D = old C
  return [u[6], u[7], u[0], u[1], u[2], u[3], u[4], u[5]]
}

function rotBackground(b: UiBackgroundProps): UiBackgroundProps {
  if (!b.texture && !b.avatarTexture) return b
  // Only 'stretch' honours UVs; every textured element here already uses it.
  return { ...b, textureMode: 'stretch', uvs: rotUvs(b.uvs) }
}
