import { sql } from 'drizzle-orm';
import { db } from '../../client';

interface node {
    children: Map<string, node>
    isTerminal: boolean
    type?: string
}

async function getPlaceMap() {
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

function construct_trie(map: Map<string, string>): node {
    const root: node = { children: new Map(), isTerminal: false};

    for (const place of map) {
        let current: node = root;
        
        const words: string[] = place[0].split(' ')

        for (const word of words) {
            if (!current.children.has(word)) {
                const child: node = {
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
