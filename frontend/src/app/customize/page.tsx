import Link from 'next/link'
import { Button } from '@/components/ui/Button'

export const metadata = { title: 'Design Studio' }

/**
 * Customize page — MVP entry point for the design flow.
 * In the full Design Studio build, this will host the canvas editor
 * (Fabric.js / Konva / custom WebGL). For now it guides users to
 * pick a product first.
 *
 * Future: mount <DesignStudioCanvas> with layer panel, template picker,
 * AI generation sidebar, and crop-frame tools.
 */
export default function CustomizePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
      <p className="text-6xl">🎨</p>
      <h1 className="mt-4 text-4xl font-bold text-gray-900">Design Studio</h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-gray-600">
        The full Design Studio — with a multi-layer canvas, template library, crop frames,
        and AI-assisted generation — is coming soon.
      </p>

      <div className="mt-8 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 py-20 text-gray-400">
        <p className="text-lg font-medium">Canvas Editor Placeholder</p>
        <p className="mt-2 text-sm">
          Fabric.js / Konva canvas will render here.<br />
          Layers panel · Template picker · AI sidebar
        </p>
      </div>

      <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <Button size="lg" asChild>
          <Link href="/products">Start from a Product</Link>
        </Button>
      </div>
    </div>
  )
}
