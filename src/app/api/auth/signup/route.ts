import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    // Verify identity server-side — never trust userId from the request body
    const authClient = await createSupabaseServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { fullName, companyName } = await req.json()
    if (!companyName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Create company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({ name: companyName })
      .select()
      .single()
    if (companyError) throw companyError

    // Create profile — if this fails, clean up the orphaned company row
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: user.id, company_id: company.id, full_name: fullName })
    if (profileError) {
      await supabase.from('companies').delete().eq('id', company.id)
      throw profileError
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
