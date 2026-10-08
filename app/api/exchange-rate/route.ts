import {getUsdInrRate} from '@/lib/currency';import {errorResponse} from '@/lib/auth';
export async function GET(){try{return Response.json(await getUsdInrRate(),{headers:{'Cache-Control':'public, max-age=3600'}});}catch(error){return errorResponse(error);}}
