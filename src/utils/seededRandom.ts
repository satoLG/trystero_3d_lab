export function seededRandom(roomId: string, index: number): number {
    let h = index * 2654435761;
    for (let i = 0; i < roomId.length; i++) {
        h = Math.imul(h ^ roomId.charCodeAt(i), 0x9e3779b1);
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x45d9f3b);
    h ^= h >>> 16;
    return (h >>> 0) / 0xffffffff;
}
