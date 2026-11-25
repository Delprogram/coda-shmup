import IComponent from "./IComponent.ts";

export type SkillId = 'shockwave' | 'shield' | 'overdrive';

export type SkillState = {
    id: SkillId;
    key: string;
    name: string;
    // 0 = just used, 1 = ready
    readiness: number;
};

type Skill = {
    id: SkillId;
    key: string;
    name: string;
    // Cooldown skills recharge with time; the ultimate recharges with kills instead
    cooldownMs: number;
    killsRequired: number;
};

// Player abilities, Valorant style: two skills on cooldown and an ultimate charged by kills.
// Emits USED_EVENT so the rest of the logic (e.g. EntityManager for the shockwave) can apply the effect.
export default class Skills extends Phaser.Events.EventEmitter implements IComponent {
    public static readonly USED_EVENT: string = 'skillUsed';

    private static readonly SKILLS: Skill[] = [
        {id: 'shockwave', key: 'F', name: 'SHOCKWAVE', cooldownMs: 8000, killsRequired: 0},
        {id: 'shield', key: 'C', name: 'SHIELD', cooldownMs: 12000, killsRequired: 0},
        {id: 'overdrive', key: 'X', name: 'OVERDRIVE', cooldownMs: 0, killsRequired: 15},
    ];

    public enabled: boolean = true;

    private readonly _lastUseTime: Map<SkillId, number> = new Map();
    private _ultimateKills: number = 0;

    public constructor() {
        super();
        // Cooldown skills start ready
        Skills.SKILLS.forEach(skill => this._lastUseTime.set(skill.id, -skill.cooldownMs));
    }

    public addKill() {
        this._ultimateKills++;
    }

    public tryUse(id: SkillId, now: number): boolean {
        const skill = Skills.SKILLS.find(s => s.id === id)!;
        if (!this.enabled || this.readiness(skill, now) < 1)
            return false;

        this._lastUseTime.set(id, now);
        if (skill.killsRequired > 0)
            this._ultimateKills = 0;

        this.emit(Skills.USED_EVENT, id);
        return true;
    }

    public states(now: number): SkillState[] {
        return Skills.SKILLS.map(skill => ({
            id: skill.id, key: skill.key, name: skill.name, readiness: this.readiness(skill, now)
        }));
    }

    private readiness(skill: Skill, now: number): number {
        if (skill.killsRequired > 0)
            return Math.min(this._ultimateKills / skill.killsRequired, 1);

        return Phaser.Math.Clamp((now - this._lastUseTime.get(skill.id)!) / skill.cooldownMs, 0, 1);
    }
}
