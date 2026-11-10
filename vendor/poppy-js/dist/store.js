/** State is lost on exit, so every restart gives Users new User IDs and signs them out. */
export class MemoryStore {
    #values = new Map();
    async get(key) {
        return this.#values.get(key);
    }
    async set(key, value) {
        this.#values.set(key, value);
    }
    async delete(key) {
        this.#values.delete(key);
    }
}
//# sourceMappingURL=store.js.map