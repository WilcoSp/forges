/** Measures browser entry bundles and checks that Lite bundles exclude webhook code. */
import { Buffer } from 'node:buffer'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'
import { rolldown } from 'rolldown'

const BUNDLES: Array<{ name: string, source: string, imports: string, absent?: string }> = [
  { name: 'forges', source: 'index.mjs', imports: 'createForges' },
  { name: 'forges/github', source: 'github/index.mjs', imports: 'github' },
  { name: 'github lite', source: 'github/index.mjs', imports: 'githubLite', absent: 'x-hub-signature-256' },
  { name: 'forges/gitlab', source: 'gitlab/index.mjs', imports: 'gitlab' },
  { name: 'gitlab lite', source: 'gitlab/index.mjs', imports: 'gitlabLite', absent: 'x-gitlab-token' },
  { name: 'forges/tangled', source: 'tangled/index.mjs', imports: 'tangled' },
  { name: 'tangled lite', source: 'tangled/index.mjs', imports: 'tangledLite', absent: 'x-tangled-signature-256' },
]

const { values } = parseArgs({
  options: {
    dist: { type: 'string', default: fileURLToPath(new URL('../dist', import.meta.url)) },
    out: { type: 'string' },
    report: { type: 'boolean', default: false },
  },
})

async function measure(directory: string, source: string, imports: string) {
  const entry = join(directory, `${imports}.mjs`)
  const target = resolve(values.dist, source)
  writeFileSync(entry, `import { ${imports} } from ${JSON.stringify(target)}\nconsole.info(${imports})\n`)
  const bundle = await rolldown({ input: entry, platform: 'browser' })
  try {
    const { output } = await bundle.generate({ format: 'esm', minify: true })
    const code = (chunk: (typeof output)[number]) => Buffer.from('code' in chunk ? chunk.code : '')
    const loaded = output.filter(chunk => 'isEntry' in chunk && chunk.isEntry).map(code)
    const lazy = output.filter(chunk => 'isDynamicEntry' in chunk && chunk.isDynamicEntry).map(code)
    const eager = Buffer.concat(loaded)
    return { minified: eager.byteLength, gzipped: gzipSync(eager).byteLength, lazy: Buffer.concat(lazy).byteLength, code: eager.toString() }
  }
  finally {
    await bundle.close()
  }
}

const directory = mkdtempSync(join(tmpdir(), 'forges-bundle-size-'))
const failures: string[] = []
const bundles = []
try {
  for (const { name, source, imports, absent } of BUNDLES) {
    const result = await measure(directory, source, imports).catch((error: unknown) => {
      if (!values.report) {
        throw error
      }
      console.warn(`${name.padEnd(16)} skipped: ${error instanceof Error ? error.message.split('\n')[0] : error}`)
    })
    if (!result) {
      continue
    }
    const { minified, gzipped, lazy, code } = result
    bundles.push({ name, minified, gzipped, lazy })
    console.info(`${name.padEnd(16)} ${String(minified).padStart(7)} min  ${String(gzipped).padStart(6)} gz  ${String(lazy).padStart(6)} lazy`)
    if (absent && code.includes(absent)) {
      failures.push(`${name} contains ${absent}`)
    }
  }
  if (values.out) {
    writeFileSync(values.out, `${JSON.stringify({ version: 1, bundles }, null, 2)}\n`)
  }
}
finally {
  rmSync(directory, { recursive: true, force: true })
}

if (failures.length && !values.report) {
  console.error(failures.join('\n'))
  process.exitCode = 1
}
