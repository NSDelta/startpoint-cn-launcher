"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const CN_API_HOST = "shijtswygamegf.leiting.com";
const versionData = [
    "// 用于官服正式用",
    JSON.stringify({
        "default": {
            "apiPath": CN_API_HOST,
        },
    })
].join("\r\n");
// iOS has no mitm proxy (unlike Android), so the game-API host must point straight at THIS local
// server. Use the server's own listen host:port (the launcher sets CN_LISTEN_HOST to the LAN IP that
// the IPA also embeds, so client and server always match) rather than a hardcoded IP.
const iosApiHost = `${process.env.CN_LISTEN_HOST || "127.0.0.1"}:${process.env.CN_LISTEN_PORT || "8001"}`;
const iosVersionData = [
    "// iOS local (game API → this local server, http, no mitm)",
    JSON.stringify({
        "default": {
            "apiScheme": "http",
            "apiPath": iosApiHost,
        },
    })
].join("\r\n");
const routes = (fastify) => __awaiter(void 0, void 0, void 0, function* () {
    fastify.get("/shijtswy/version/client_release_android.dis", (_request, reply) => __awaiter(void 0, void 0, void 0, function* () {
        reply.header("content-type", "text/plain; charset=utf-8");
        reply.status(200).send(versionData);
    }));
    fastify.get("/shijtswy/version/client_release_ios.dis", (_request, reply) => __awaiter(void 0, void 0, void 0, function* () {
        reply.header("content-type", "text/plain; charset=utf-8");
        reply.status(200).send(iosVersionData);
    }));
});
exports.default = routes;
