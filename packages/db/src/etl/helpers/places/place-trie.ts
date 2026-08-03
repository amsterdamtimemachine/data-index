/**
 * properties of a node. value corresponds to the (partial) name of location.
 * children are the nodes extending the current value. 
 * isTerminal defines if a node is an actual location. 
 * Type corresponds to the type of location (street, address, etc.)
 */
export interface node {
    value?: string
    children: Map<string, node>
    isTerminal: boolean
    type?: string
}

export class PlaceTrie {
    public root: node | undefined = undefined

    constructor(places: Map<string, string>) {
        this.root = this.construct(places)
    }

    /**
     * Constructs a trie of places. Starting at root (''), each child correspond to path to an existing place. 
     * We chose to use a trie-object instead of a lookup-table, for efficiency & scaling
     * @param map of existing places (and their types)
     * @returns root-node of trie. can be traversed by following node.children to other nodes
     */
    private construct(map: Map<string, string>): node {
        const root: node = { value: '', children: new Map(), isTerminal: false};

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

            current.value = place[0]
            current.isTerminal = true
            current.type = place[1]
        }

        return root
    }

    /**
     * Checks if provided word exists in one of the children (thus possibly leading to a actual place)
     * @param word 
     * @param node 
     * @returns true or false
     */
    private isChild(word: string, node: node) {
        return node.children.has(word)
    }

    /**
     * Split the text in words. For each words, check if it is a child of the current node (starting at root ('')).
     * If it is, iteratively check if the succeeding word excists as a child in the previously found node.
     * If we end at a terminal-node, we found the words for an existing place
     * @param text to find place in
     * @param root of trie constructed based on available places
     * @returns matches descendingly sorted by length
     */
    public match(text: string): node[] {
        if (!this.root) { return [] }

        const matches: node[] = []
        const words = text.toLowerCase().split(' ');

        for (let i = 0; i < words.length; i++) {
            let current = this.root

            for (let j = i; j < words.length; j++) {
                const word = words[j]

                if (!this.isChild(word, current)) { break }
                current = current.children.get(word)!

                if (current.isTerminal && (j + 1 >= words.length || !current.children.has(words[j + 1]))) {
                    matches.push(current)
                }
            }
        }

        return matches.sort((a, b) => b.value!.length - a.value!.length)
    }
}