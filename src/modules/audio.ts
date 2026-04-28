import { AUDIO_CONFIG } from '../config/audio.ts';

export function enableMusicOnUserGesture(ctx: any) {
    if (ctx.backgroundMusic) return;
    ctx.backgroundMusic = new Audio('/sounds/background/Aylex - Uke Waves (freetouse.com).mp3');
    ctx.backgroundMusic.loop = true;
    ctx.backgroundMusic.volume = AUDIO_CONFIG.musicVolume;
    const playMusic = () => {
        ctx.backgroundMusic.play().catch(() => {});
        window.removeEventListener('pointerdown', playMusic);
        window.removeEventListener('keydown', playMusic);
    };
    window.addEventListener('pointerdown', playMusic);
    window.addEventListener('keydown', playMusic);
}

export function initSounds(ctx: any) {
    ctx.footstepGrassSounds = Array.from({ length: 5 }, (_, i) => {
        const a = new Audio(`/sounds/moves/footstep_grass_00${i}.ogg`);
        a.volume = AUDIO_CONFIG.footstepGrassVolume;
        return a;
    });
    ctx.footstepConcreteSounds = Array.from({ length: 5 }, (_, i) => {
        const a = new Audio(`/sounds/moves/footstep_concrete_00${i}.ogg`);
        a.volume = AUDIO_CONFIG.footstepConcreteVolume;
        return a;
    });
    ctx.footstepSounds = ctx.footstepGrassSounds;
    ctx.impactWoodSounds = Array.from({ length: 5 }, (_, i) => {
        const a = new Audio(`/sounds/moves/impactWood_heavy_00${i}.ogg`);
        a.volume = AUDIO_CONFIG.impactWoodVolume;
        return a;
    });
    ctx.jumpSound = new Audio('/sounds/moves/phaseJump1.ogg');
    ctx.jumpSound.volume = AUDIO_CONFIG.jumpVolume;
}
