(function attachLegacyExperimentControls(global) {
    'use strict';

    const instances = new WeakMap();
    let selectionMode = 'replace';

    function normalizeFilename(value, fallback = 'cena.spatialseed') {
        const trimmed = String(value || '').trim();
        const filename = trimmed || fallback;
        return /\.(?:json|spatialseed)$/i.test(filename)
            ? filename
            : `${filename}.spatialseed`;
    }

    function updateSelectionModeButton(button) {
        const additive = selectionMode === 'toggle';
        button.textContent = additive
            ? 'Seleção: alternar'
            : 'Seleção: substituir';
        button.setAttribute('aria-pressed', String(additive));
        button.title = additive
            ? 'Cada toque adiciona ou remove um objeto da seleção.'
            : 'Um toque substitui a seleção; Shift continua adicionando no teclado.';
    }

    function selectObject(event, selection, objectId) {
        if (objectId === undefined || objectId === null) return;
        const toggle = Boolean(event && event.shiftKey)
            || selectionMode === 'toggle';
        if (toggle) {
            if (selection.has(objectId)) selection.delete(objectId);
            else selection.add(objectId);
            return;
        }
        if (!selection.has(objectId) || selection.size !== 1) {
            selection.clear();
            selection.add(objectId);
        }
    }

    function clearSelection(selection) {
        selection.clear();
    }

    function applyProjection(camera, nearValue, farValue) {
        const near = Number(nearValue);
        const far = Number(farValue);
        if (!Number.isFinite(near) || !Number.isFinite(far)) {
            throw new TypeError('Near e far precisam ser números finitos.');
        }
        if (!(near > 0 && far > near)) {
            throw new RangeError('Use 0 < near < far.');
        }
        camera.near = near;
        camera.far = far;
        camera.updateProjectionMatrix();
        return { near, far };
    }

    async function saveJson(data, suggestedName = 'cena.spatialseed') {
        const suggestion = normalizeFilename(suggestedName);
        const json = typeof data === 'string'
            ? data
            : JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });

        if (typeof global.showSaveFilePicker === 'function') {
            try {
                const handle = await global.showSaveFilePicker({
                    suggestedName: suggestion,
                    types: [{
                        description: 'Projeto SpatialSeed',
                        accept: {
                            'application/json': ['.spatialseed', '.json'],
                        },
                    }],
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                return true;
            } catch (error) {
                if (error && error.name === 'AbortError') return false;
                console.warn(
                    'Seletor nativo indisponível; usando download nomeado.',
                    error,
                );
            }
        }

        const requested = global.prompt(
            'Nome do arquivo para salvar:',
            suggestion,
        );
        if (requested === null) return false;
        const filename = normalizeFilename(requested, suggestion);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.hidden = true;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        global.setTimeout(() => URL.revokeObjectURL(url), 0);
        return true;
    }

    function createPanel(options) {
        const details = document.createElement('details');
        details.className = 'spatialseed-legacy-controls';
        details.innerHTML = `
            <summary>Visão e seleção</summary>
            <div class="spatialseed-legacy-controls__body">
                <button type="button" data-action="selection-mode"></button>
                <button type="button" data-action="select-all">Selecionar tudo</button>
                <label>
                    Near
                    <input data-field="near" type="number" min="0.000001"
                        step="any" inputmode="decimal">
                </label>
                <label>
                    Far
                    <input data-field="far" type="number" min="0.000002"
                        step="any" inputmode="decimal">
                </label>
                <button type="button" data-action="projection">Aplicar recorte</button>
                <output data-field="status" aria-live="polite"></output>
            </div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            .spatialseed-legacy-controls {
                position: fixed;
                z-index: 1200;
                right: .55rem;
                bottom: .55rem;
                max-width: min(18rem, calc(100vw - 1.1rem));
                color: #eef5ff;
                background: rgba(8, 16, 26, .94);
                border: 1px solid rgba(130, 184, 255, .48);
                border-radius: .7rem;
                box-shadow: 0 .5rem 1.5rem rgba(0, 0, 0, .35);
                font: 500 .82rem/1.3 system-ui, sans-serif;
            }
            .spatialseed-legacy-controls summary {
                cursor: pointer;
                padding: .62rem .75rem;
                user-select: none;
            }
            .spatialseed-legacy-controls__body {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: .5rem;
                padding: 0 .65rem .65rem;
            }
            .spatialseed-legacy-controls button,
            .spatialseed-legacy-controls label,
            .spatialseed-legacy-controls input {
                min-width: 0;
                box-sizing: border-box;
                font: inherit;
            }
            .spatialseed-legacy-controls button {
                min-height: 2.4rem;
                color: inherit;
                background: #18283b;
                border: 1px solid #4b6c91;
                border-radius: .45rem;
                padding: .4rem .5rem;
            }
            .spatialseed-legacy-controls label {
                display: grid;
                gap: .2rem;
                color: #bed2e8;
            }
            .spatialseed-legacy-controls input {
                width: 100%;
                color: #fff;
                background: #0b1420;
                border: 1px solid #4b6c91;
                border-radius: .4rem;
                padding: .42rem;
            }
            .spatialseed-legacy-controls output {
                grid-column: 1 / -1;
                min-height: 1.1rem;
                color: #a9d4ff;
            }
        `;
        document.head.append(style);
        document.body.append(details);

        const modeButton = details.querySelector('[data-action="selection-mode"]');
        const nearInput = details.querySelector('[data-field="near"]');
        const farInput = details.querySelector('[data-field="far"]');
        const status = details.querySelector('[data-field="status"]');
        nearInput.value = String(options.camera.near);
        farInput.value = String(options.camera.far);
        updateSelectionModeButton(modeButton);

        modeButton.addEventListener('click', () => {
            selectionMode = selectionMode === 'replace' ? 'toggle' : 'replace';
            document
                .querySelectorAll(
                    '.spatialseed-legacy-controls [data-action="selection-mode"]',
                )
                .forEach(updateSelectionModeButton);
        });

        details
            .querySelector('[data-action="select-all"]')
            .addEventListener('click', () => {
                options.selection.clear();
                for (const object of options.getObjects()) {
                    if (object && object.id !== undefined) {
                        options.selection.add(object.id);
                    }
                }
                options.onSelectionChanged();
                status.value = `${options.selection.size} objeto(s) selecionado(s).`;
            });

        details
            .querySelector('[data-action="projection"]')
            .addEventListener('click', () => {
                try {
                    const projection = applyProjection(
                        options.camera,
                        nearInput.value,
                        farInput.value,
                    );
                    status.value = `Recorte: ${projection.near} – ${projection.far}.`;
                } catch (error) {
                    status.value = error.message;
                }
            });
        return details;
    }

    function install(options) {
        if (!options || !options.camera || !options.selection) {
            throw new TypeError('Câmera e seleção são obrigatórias.');
        }
        if (typeof options.getObjects !== 'function'
            || typeof options.onSelectionChanged !== 'function') {
            throw new TypeError(
                'getObjects e onSelectionChanged precisam ser funções.',
            );
        }
        if (instances.has(options.camera)) return instances.get(options.camera);
        const panel = createPanel(options);
        const instance = { panel };
        instances.set(options.camera, instance);
        return instance;
    }

    global.SpatialSeedLegacy = Object.freeze({
        applyProjection,
        clearSelection,
        install,
        normalizeFilename,
        saveJson,
        selectObject,
    });
})(window);
