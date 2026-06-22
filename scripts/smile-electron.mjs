import path from 'path'
import { fileURLToPath } from 'url'

const brandedExe = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', 'bin', 'smile-dev.exe')

export default brandedExe
