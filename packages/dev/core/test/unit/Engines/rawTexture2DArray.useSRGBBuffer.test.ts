/**
 * @vitest-environment jsdom
 */

import { Constants } from "core/Engines/constants";
import { ThinEngine } from "core/Engines/thinEngine";
import { ThinWebGPUEngine } from "core/Engines/thinWebGPUEngine";
import { RegisterEnginesExtensionsEngineRawTexture } from "core/Engines/Extensions/engine.rawTexture.pure";
import { RegisterEnginesWebGPUExtensionsEngineRawTexture } from "core/Engines/WebGPU/Extensions/engine.rawTexture.pure";
import type {} from "core/Engines/WebGPU/Extensions/engine.rawTexture.types";
import { InternalTexture, InternalTextureSource } from "core/Materials/Textures/internalTexture";
import { describe, expect, it, vi } from "vitest";

const SRGB_SIZED_FORMAT = 0x8c43; // SRGB8_ALPHA8
const LINEAR_SIZED_FORMAT = 0x8058; // RGBA8

describe("createRawTexture2DArray useSRGBBuffer", () => {
    describe("WebGPU", () => {
        RegisterEnginesWebGPUExtensionsEngineRawTexture();

        function createEngine(supportSRGBBuffers: boolean) {
            // The GPU format is chosen once, when the GPU texture is created: record the flag at that moment.
            const flagWhenGPUTextureWasCreated: boolean[] = [];
            const engine = Object.create(ThinWebGPUEngine.prototype) as any;
            engine._doNotHandleContextLost = false;
            engine._internalTexturesCache = [];
            engine._createHardwareTexture = () => ({});
            engine._getUseSRGBBuffer = vi.fn((useSRGBBuffer: boolean) => useSRGBBuffer && supportSRGBBuffers);
            engine._textureHelper = {
                updateMipLevelCountForInternalTexture: vi.fn(),
                createGPUTextureForInternalTexture: vi.fn((texture: InternalTexture) => {
                    flagWhenGPUTextureWasCreated.push(texture._useSRGBBuffer);
                }),
            };
            engine.updateRawTexture2DArray = vi.fn();
            return { engine: engine as ThinWebGPUEngine & Record<string, any>, flagWhenGPUTextureWasCreated };
        }

        function create(engine: ThinWebGPUEngine, useSRGBBuffer?: boolean) {
            return engine.createRawTexture2DArray(
                null,
                4,
                4,
                5,
                Constants.TEXTUREFORMAT_RGBA,
                false,
                false,
                Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
                null,
                Constants.TEXTURETYPE_UNSIGNED_BYTE,
                0,
                undefined,
                useSRGBBuffer
            );
        }

        it("sets the flag before the GPU texture is created", () => {
            const { engine, flagWhenGPUTextureWasCreated } = createEngine(true);

            const texture = create(engine, true);

            expect(flagWhenGPUTextureWasCreated).toEqual([true]);
            expect(texture._useSRGBBuffer).toBe(true);
            expect(texture.is2DArray).toBe(true);
            expect(texture.depth).toBe(5);
        });

        it("stays linear when the argument is omitted", () => {
            const { engine, flagWhenGPUTextureWasCreated } = createEngine(true);

            const texture = create(engine);

            expect(flagWhenGPUTextureWasCreated).toEqual([false]);
            expect(texture._useSRGBBuffer).toBe(false);
        });

        it("stays linear when the engine cannot create sRGB buffers", () => {
            const { engine, flagWhenGPUTextureWasCreated } = createEngine(false);

            const texture = create(engine, true);

            expect(flagWhenGPUTextureWasCreated).toEqual([false]);
            expect(texture._useSRGBBuffer).toBe(false);
        });
    });

    describe("WebGL", () => {
        RegisterEnginesExtensionsEngineRawTexture();

        function createEngine(supportSRGBBuffers: boolean) {
            const gl = {
                TEXTURE_2D_ARRAY: 0x8c1a,
                TEXTURE_MAG_FILTER: 0x2800,
                TEXTURE_MIN_FILTER: 0x2801,
                UNPACK_ALIGNMENT: 0xcf5,
                texParameteri: vi.fn(),
                generateMipmap: vi.fn(),
                pixelStorei: vi.fn(),
                texImage3D: vi.fn(),
                compressedTexImage3D: vi.fn(),
            };
            const engine = Object.create(ThinEngine.prototype) as any;
            engine._gl = gl;
            engine._doNotHandleContextLost = false;
            engine._internalTexturesCache = [];
            engine._createHardwareTexture = () => ({});
            engine._getUseSRGBBuffer = vi.fn((useSRGBBuffer: boolean) => useSRGBBuffer && supportSRGBBuffers);
            engine._getWebGLTextureType = vi.fn(() => 0x1401);
            engine._getInternalFormat = vi.fn(() => 0x1908);
            engine._getRGBABufferInternalSizedFormat = vi.fn((_type: number, _format?: number, useSRGBBuffer?: boolean) =>
                useSRGBBuffer ? SRGB_SIZED_FORMAT : LINEAR_SIZED_FORMAT
            );
            engine._getSamplingParameters = vi.fn(() => ({ min: 0x2601, mag: 0x2601 }));
            engine._bindTextureDirectly = vi.fn();
            engine._unpackFlipY = vi.fn();
            return { engine: engine as ThinEngine & Record<string, any>, gl };
        }

        function create(engine: ThinEngine, useSRGBBuffer?: boolean) {
            return engine.createRawTexture2DArray(
                new Uint8Array(4 * 4 * 5 * 4),
                4,
                4,
                5,
                Constants.TEXTUREFORMAT_RGBA,
                false,
                false,
                Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
                null,
                Constants.TEXTURETYPE_UNSIGNED_BYTE,
                0,
                undefined,
                useSRGBBuffer
            );
        }

        it("uploads with the sRGB sized format", () => {
            const { engine, gl } = createEngine(true);

            const texture = create(engine, true);

            expect(texture._useSRGBBuffer).toBe(true);
            expect(gl.texImage3D).toHaveBeenCalledTimes(1);
            expect(gl.texImage3D.mock.calls[0][2]).toBe(SRGB_SIZED_FORMAT);
        });

        it("uploads with the linear sized format when the argument is omitted", () => {
            const { engine, gl } = createEngine(true);

            const texture = create(engine);

            expect(texture._useSRGBBuffer).toBe(false);
            expect(gl.texImage3D.mock.calls[0][2]).toBe(LINEAR_SIZED_FORMAT);
        });

        it("uploads with the linear sized format when the GPU cannot create sRGB buffers", () => {
            const { engine, gl } = createEngine(false);

            const texture = create(engine, true);

            expect(texture._useSRGBBuffer).toBe(false);
            expect(gl.texImage3D.mock.calls[0][2]).toBe(LINEAR_SIZED_FORMAT);
        });

        it("keeps createRawTexture3D linear", () => {
            const { engine, gl } = createEngine(true);

            engine.createRawTexture3D(new Uint8Array(4 * 4 * 4 * 4), 4, 4, 4, Constants.TEXTUREFORMAT_RGBA, false, false, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);

            expect(gl.texImage3D.mock.calls[0][2]).toBe(LINEAR_SIZED_FORMAT);
        });
    });

    describe("context loss", () => {
        it("rebuilds the array with the same flag", () => {
            const proxy = { _swapAndDie: vi.fn() };
            const createRawTexture2DArray = vi.fn(() => proxy);
            const texture = Object.create(InternalTexture.prototype) as InternalTexture & Record<string, any>;
            texture._engine = { createRawTexture2DArray, updateRawTexture2DArray: vi.fn() } as any;
            texture._source = InternalTextureSource.Raw2DArray;
            texture.baseWidth = 4;
            texture.baseHeight = 4;
            texture.baseDepth = 5;
            texture.format = Constants.TEXTUREFORMAT_RGBA;
            texture.type = Constants.TEXTURETYPE_UNSIGNED_BYTE;
            texture.generateMipMaps = false;
            texture._useSRGBBuffer = true;

            texture._rebuild();

            expect(createRawTexture2DArray).toHaveBeenCalledTimes(1);
            const args = createRawTexture2DArray.mock.calls[0] as unknown[];
            expect(args).toHaveLength(13);
            expect(args[12]).toBe(true);
            expect(proxy._swapAndDie).toHaveBeenCalledWith(texture, false);
        });
    });
});
