// Turns off zod's compiled fast path. Imported first in worker.ts, before any
// module that builds a schema.
//
// zod v4 decides at the moment a schema is built whether it may compile a
// parser with `new Function` (util.allowsEval). In the Worker's queue bundle
// the schemas are built while the Worker starts, when Workers still allow
// code generation, so zod says yes; the first parse inside the queue handler
// then compiles and the runtime refuses: "Code generation from strings
// disallowed for this context" (seen live on 22 November, the first design
// job after the queue's environment was fixed). Web requests never hit it,
// because OpenNext loads route code on demand, after start-up. jitless parsing
// gives the same results, only without the compiled shortcut.
import { config } from "zod/v4/core"

config({ jitless: true })
