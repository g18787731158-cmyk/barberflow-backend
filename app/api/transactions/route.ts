import { NextResponse } from 'next/server';
import { transactions } from '../../data/transactions';

export async function GET() {
  return NextResponse.json({
    count: transactions.length,
    list: transactions
  });
}