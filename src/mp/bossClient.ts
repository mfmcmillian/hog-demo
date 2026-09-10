import { engine } from '@dcl/sdk/ecs'
import { grantAccountXp, XP } from '../game/level'
import { game } from '../game/store'
import { getMyAddress } from './identity'
import { BossMsg, BossPub, BossUpdate, BossYou } from './protocol'
import { MpBossState, room } from './transport'
import { bossView } from './views'

// Client side of the world boss. The lair (boss, pool, board) is a synced
// snapshot everyone mirrors; my own attack arrives as private bossUpdate
// steps that feed the regular battle UI/FX through game.battle, exactly the
// way a spectated rift fight does.

export function bossAttack(): void {
  const msg: BossMsg = { type: 'attack' }
  bossView.result = undefined
  bossView.blocked = ''
  room.send('bossMsg', { json: JSON.stringify(msg) })
}

/** Where I stand as the server last published it (rank 0 = not yet attacked). */
export function myBoss(): BossYou {
  return bossView.pub.you[getMyAddress()] ?? { rank: 0, best: 0, left: 0 }
}

export function bossFighting(): boolean {
  return !!bossView.fight
}

/** Whole seconds left on my attack, counted down locally between the
 * server's steps (which arrive every BOSS_STEP_S). */
export function bossSecondsLeft(): number {
  const fight = bossView.fight
  if (!fight) return 0
  return Math.max(0, Math.ceil(fight.left - (Date.now() - fight.at) / 1000))
}

export function setupBossClient(): void {
  room.onMessage('bossUpdate', (data) => {
    if (!getMyAddress() || data.address.toLowerCase() !== getMyAddress()) return
    let update: BossUpdate
    try {
      update = JSON.parse(data.json) as BossUpdate
    } catch {
      return
    }
    if (update.type === 'fight') {
      bossView.fight = { battle: update.battle, left: update.left, dealt: update.dealt, at: Date.now() }
      bossView.result = undefined
      return
    }
    if (update.type === 'done') {
      bossView.fight = undefined
      bossView.result = {
        dealt: update.dealt,
        best: update.best,
        rank: update.rank,
        kill: update.kill === true,
        wiped: update.wiped === true
      }
      // Every attack feeds the account level, like a raid or a duel.
      grantAccountXp(XP.boss)
      return
    }
    bossView.blocked = update.reason
    bossView.blockedAge = 0
  })
}

export function tickBossMirror(dt: number): void {
  for (const [, state] of engine.getEntitiesWith(MpBossState)) {
    if (state.revision === bossView.revision) break
    bossView.revision = state.revision
    try {
      bossView.pub = JSON.parse(state.json) as BossPub
    } catch {
      // keep the last good lair
    }
    break
  }
  if (bossView.blocked) {
    bossView.blockedAge += dt
    if (bossView.blockedAge > 2.5) bossView.blocked = ''
  }
  // My attack: the server-simulated battle feeds the regular battle UI/FX.
  if (game.phase === 'boss' && bossView.fight) game.battle = bossView.fight.battle
}
