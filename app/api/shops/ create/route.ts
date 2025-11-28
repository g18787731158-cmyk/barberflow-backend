import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 临时先不连数据库，只是回显一下传进来的内容
    return NextResponse.json(
      {
        success: true,
        message: 'shop create API is working',
        received: body,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in /api/shops/create:', error);
    return NextResponse.json(
      { success: false, message: 'Invalid JSON body' },
      { status: 400 }
    );
  }
}