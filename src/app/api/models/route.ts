import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET() {
  try {
    const authClient = await createSupabaseServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const serviceClient = createServerSupabaseClient()
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()
    if (!profile?.company_id) {
      return NextResponse.json([])
    }
    const { data, error } = await serviceClient
      .from('models')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
