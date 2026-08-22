import { FAMILIARS, HEROES } from '../game/familiars'

export const HALL_W = 1024
export const HALL_H = 576

const INSPECT_SRC = 'images/halls/inspect-a.png'

export function hallSrc(id: string): string {
  return `images/halls/${id}-a.png`
}

/** Convention: `images/halls/{id}-a.png` at 1024×576. No per-id label rows. */
export function hallArt(id: string) {
  return { src: hallSrc(id), w: HALL_W, h: HALL_H }
}

export function allHallSrcs(): string[] {
  return [INSPECT_SRC, ...HEROES.map((hero) => hallSrc(hero.id)), ...FAMILIARS.map((def) => hallSrc(def.id))]
}

export const CARD_BACK_W = 1024
export const CARD_BACK_H = 512

export function cardBackArt() {
  return { src: 'images/hud/card-back-a.png', w: CARD_BACK_W, h: CARD_BACK_H }
}
