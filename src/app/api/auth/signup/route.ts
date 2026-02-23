import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { userId, fullName, companyName } = await req.json()
    if (!userId || !companyName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    const supabase = createServerSupabaseClient()
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({ name: companyName })
      .select()
      .single()
    if (companyError) throw companyError
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: userId, company_id: company.id, full_name: fullName })
    if (profileError) throw profileError
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
