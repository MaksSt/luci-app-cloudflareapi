'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'htdocs/luci-static/resources/view/cloudflareapi/overview.js'),
    'utf8'
);
const prelude = source.split('return view.extend({', 1)[0];
const pages = {
    1: { success: true, result: [ 'zone-1' ], result_info: { page: 1, total_pages: 3 } },
    2: { success: true, result: [ 'zone-2' ], result_info: { page: 2, total_pages: 3 } },
    3: { success: true, result: [ 'zone-3' ], result_info: { page: 3, total_pages: 3 } }
};
const calls = [];
const fsMock = {
    exec_direct: function(_command, args) {
        var page = Number(args[args.length - 1]);
        calls.push(page);
        return Promise.resolve(JSON.stringify(pages[page]));
    }
};
const loadHelpers = new Function(
    'fs',
    '_',
    prelude + '\nreturn { parseApiPage: parseApiPage, fetchAllPages: fetchAllPages };'
);
const helpers = loadHelpers(fsMock, function(value) { return value; });

helpers.fetchAllPages([ 'zones' ])
    .then(function(result) {
        assert.deepEqual(result, [ 'zone-1', 'zone-2', 'zone-3' ]);
        assert.deepEqual(calls, [ 1, 2, 3 ]);
        assert.throws(
            function() {
                helpers.parseApiPage(JSON.stringify({
                    success: false,
                    errors: [ { message: 'API failure' } ]
                }));
            },
            /API failure/
        );
        console.log('Frontend pagination tests passed.');
    })
    .catch(function(error) {
        console.error(error);
        process.exitCode = 1;
    });
