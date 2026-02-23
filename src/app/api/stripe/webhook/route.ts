import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabaseClient } from '@/lib/supabase'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Webhook signature failed' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const companyId = session.metadata?.company_id
    if (!companyId) {
      console.error('checkout.session.completed: missing company_id in metadata', session.id)
      return NextResponse.json({ received: true })
    }
    const { error } = await supabase
      .from('companies')
      .update({
        plan: 'pro',
        subscription_status: 'active',
        stripe_subscription_id: session.subscription as string,
      })
      .eq('id', companyId)
    if (error) {
      console.error('Failed to upgrade company to pro:', error)
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription
    const { error } = await supabase
      .from('companies')
      .update({ plan: 'free', subscription_status: 'inactive' })
      .eq('stripe_subscription_id', subscription.id)
    if (error) {
      console.error('Failed to downgrade company to free:', error)
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
    }
  }

  if (event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as Stripe.Subscription
    const status = subscription.status
    if (status === 'past_due' || status === 'unpaid' || status === 'paused') {
      const { error } = await supabase
        .from('companies')
        .update({ subscription_status: status })
        .eq('stripe_subscription_id', subscription.id)
      if (error) {
        console.error('Failed to update subscription status:', error)
        return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ received: true })
}
