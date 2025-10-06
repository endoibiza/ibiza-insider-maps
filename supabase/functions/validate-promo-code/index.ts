import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { code } = await req.json();
    
    console.log('Validating promo code:', code);

    if (!code || typeof code !== 'string') {
      console.log('Invalid promo code format');
      return new Response(
        JSON.stringify({ valid: false, error: 'Invalid promo code format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate code format (uppercase alphanumeric)
    const sanitizedCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9]+$/.test(sanitizedCode)) {
      console.log('Invalid characters in promo code');
      return new Response(
        JSON.stringify({ valid: false, error: 'Invalid promo code format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if code exists and is active
    const { data: promoCode, error: fetchError } = await supabaseClient
      .from('promo_codes')
      .select('code, is_active, uses_count, max_uses')
      .eq('code', sanitizedCode)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching promo code:', fetchError);
      return new Response(
        JSON.stringify({ valid: false, error: 'Server error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!promoCode) {
      console.log('Promo code not found');
      return new Response(
        JSON.stringify({ valid: false, error: 'Invalid promo code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!promoCode.is_active) {
      console.log('Promo code is inactive');
      return new Response(
        JSON.stringify({ valid: false, error: 'This promo code is no longer active' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (promoCode.max_uses && promoCode.uses_count >= promoCode.max_uses) {
      console.log('Promo code usage limit reached');
      return new Response(
        JSON.stringify({ valid: false, error: 'This promo code has reached its usage limit' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Promo code validated successfully');
    return new Response(
      JSON.stringify({ valid: true, code: sanitizedCode }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error validating promo code:', error);
    return new Response(
      JSON.stringify({ valid: false, error: 'Server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
