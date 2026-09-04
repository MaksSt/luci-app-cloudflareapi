'use strict';

// Executes the production view with in-memory LuCI/RPC substitutes, never a router.
// The shell models light/dark LuCI containers; real-router theme QA is separate.
function mountView(source, css, scenario) {
    document.head.innerHTML = '<meta name="viewport" content="width=device-width,initial-scale=1">';
    const style = document.createElement('style');
    style.textContent = `
        body { margin: 0; background: #fff; color: #282828; font: 16px/1.5 Arial, sans-serif; }
        main { max-width: 1300px; margin: auto; padding: 24px; }
        button, input { font: inherit; border: 1px solid #858585; border-radius: 4px; padding: 8px; color: inherit; background: inherit; }
        button { cursor: pointer; } .cbi-button-save { background: #1765a0; border-color: #1765a0; color: white; }
        @media (max-width: 600px) { main { padding: 16px; } }
        @media (prefers-color-scheme: dark) { body { background: #202020; color: #eee; } }
    ` + css;
    document.head.append(style);
    document.body.innerHTML = '<main></main><aside id="notifications" aria-live="polite"></aside>';
    const longName = 'a'.repeat(60) + '.' + 'b'.repeat(60) + '.example.com';
    const records = scenario === 'empty' ? [] : [
        { '.name': 'r1', record_id: 'r1', name: 'home.example.com', type: 'A', zone_name: 'example.com', enabled: '1' },
        { '.name': 'r2', record_id: 'r2', name: longName, type: 'A', zone_name: longName, enabled: '0' }
    ];
    const settings = { enabled: '1', token: '', check_hour: '3', check_on_boot: '1',
        last_ip: '203.0.113.5', last_check: '2026-09-05 04:00:00',
        last_error: scenario === 'error' ? 'Ошибка Cloudflare: ' + longName.repeat(3) : '' };
    window.testState = { settings, records, saved: 0, calls: [] };
    function E(tag, attrs, children) {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(attrs || {})) {
            if (typeof value === 'function') node.addEventListener(key, value);
            else node.setAttribute(key, value);
        }
        function append(child) {
            if (Array.isArray(child)) child.forEach(append);
            else if (child != null) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
        }
        append(children);
        return node;
    }
    const uci = {
        sections: () => records,
        get: (_c, _s, key) => settings[key],
        load: () => Promise.resolve(),
        save: () => { window.testState.saved++; return Promise.resolve(); },
        add: () => { const id = 'added-' + records.length; records.push({ '.name': id }); return id; },
        remove: (_c, id) => { const i = records.findIndex(r => r['.name'] === id); if (i >= 0) records.splice(i, 1); },
        set: (_c, id, key, value) => { (id === 'settings' ? settings : records.find(r => r['.name'] === id))[key] = value; }
    };
    const rpc = {
        exec: (path, args) => { window.testState.calls.push({ path, args }); return Promise.resolve({ code: 0 }); },
        exec_direct: (_path, args) => {
            if (scenario === 'loading') return new Promise(() => {});
            if (scenario === 'error') return Promise.reject(new Error('API unavailable'));
            const result = scenario === 'empty' ? [] : args[0] === 'zones'
                ? [ { id: 'zone1', name: 'example.com' }, { id: 'zone2', name: longName } ]
                : [ { id: 'r1', name: 'home.example.com', type: 'A', content: '203.0.113.5' },
                    { id: 'r3', name: longName, type: 'A', content: '203.0.113.6' },
                    { id: 'r4', name: 'ignored.example.com', type: 'AAAA', content: '2001:db8::1' } ];
            return Promise.resolve(JSON.stringify({ success: true, result, result_info: { page: 1, total_pages: 1 } }));
        }
    };
    const ui = { addNotification: (_id, node) => document.querySelector('#notifications').append(node) };
    const view = new Function('view', 'uci', 'fs', 'ui', 'E', '_', 'L', source)(
        { extend: v => v }, uci, rpc, ui, E, s => s, { resource: () => 'data:text/css,' }
    );
    document.querySelector('main').append(view.render());
}

module.exports = { mountView };
