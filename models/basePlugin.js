export default function basePlugin(schema) {
    schema.add({
        id: { type: String, required: true }
    });
    schema.set('timestamps', true);
}
