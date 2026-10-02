import { Card } from '../ui'

/** Stand-in for a screen that is designed (see design/portal-prototype.html) but not built yet. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <h2 className="mb-1.5 font-head text-2xl font-bold tracking-tight">{title}</h2>
      <Card className="mt-5 px-5 py-12 text-center text-text-3">
        <b className="block text-[15px] text-text">Not built yet</b>
        See this screen in design/portal-prototype.html.
      </Card>
    </>
  )
}
