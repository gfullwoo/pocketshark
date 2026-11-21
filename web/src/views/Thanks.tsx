import { useEffect, useState } from 'react'
import { formatUsd } from '../../../server/src/catalog'
import { HERO } from '../lib/photos'

interface Props {
  query: URLSearchParams
  onPaid: () => void
}

export function Thanks({ query, onPaid }: Props) {
  const id = query.get('session_id')
  const [info, setInfo] = useState<{ status: string; email: string | null; total: number | null } | null>(null)

  useEffect(() => {
    if (!id) return
    fetch(`/api/order/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setInfo(d)
        if (d?.status === 'paid') onPaid()
      })
      .catch(() => setInfo(null))
  }, [id, onPaid])

  return (
    <section className="thanks">
      <img className="photo photo--band" src={HERO.src} alt={HERO.alt} />
      <h1>Your shark is on its way.</h1>
      <p className="lede">
        {info?.email ? <>A receipt is headed to <b>{info.email}</b>. </> : null}
        {info?.total != null ? <>Order total {formatUsd(info.total)}. </> : null}
        We’ll email tracking as soon as it ships.
      </p>
      <a className="btn btn--ghost" href="#/">Back to the deep</a>
    </section>
  )
}
