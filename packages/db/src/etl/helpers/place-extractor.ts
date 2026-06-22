import { is, sql } from 'drizzle-orm';
import { db } from '../../client';
import { writeFileSync } from "fs";

export interface node {
    value: string
    children: Map<string, node>
    isTerminal: boolean
    type?: string
}

export async function getPlaceMap() {
    const allPlaces = await db.execute<{ preferred_label: string, type: string }>(sql`
        SELECT DISTINCT preferred_label, type FROM place  
    `);

    const placeMap = new Map<string, string>(
        allPlaces.rows
            .filter(row => row.preferred_label != null)
            .map(row => [
                row.preferred_label.toLowerCase(),
                row.type
            ])
    );

    return placeMap;
}

export function constructTrie(map: Map<string, string>): node {
    const root: node = { value: '', children: new Map(), isTerminal: false};

    for (const place of map) {
        let current: node = root;
        
        const words: string[] = place[0].split(' ')

        for (const word of words) {
            if (!current.children.has(word)) {
                const child: node = {
                    value: word,
                    children: new Map(),
                    isTerminal: false,
                }

                current.children.set(word, child)
            }

            current = current.children.get(word)!
        }

        current.isTerminal = true
        current.type = place[1]
    }

    return root
}

function isChild(word: string, node: node) {
    return node.children.has(word)
}

export function match(text: string, root: node): node[] {
    const matches: node[] = []
    const words = text.toLowerCase().split(' ');

    for (let i = 0; i < words.length; i++) {
        let current = root

        for (let j = i; j < words.length; j++) {
            const word = words[j]

            if (!isChild(word, current)) { break }

            current = current.children.get(word)!

            if (current.isTerminal) {
                matches.push(current)
            }
        }
    }

    return matches.sort((a, b) => b.value.length - a.value.length)
}