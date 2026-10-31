const business = $('Business Loop').item.json;
const upsert = $('Upsert Business').item.json;
let response = $input.first().json;
if (!upsert.id) response = { status: 'ERROR', error_code: 'DATABASE_ERROR', error_message: 'Không lưu được ID cơ sở, bỏ qua cơ sở này.' };
else if (business.business_limit === 0) response = { status: 'OK', scanned: 0, reviews: [] };
else if (response.error) response = { status: 'ERROR', error_code: 'NETWORK_ERROR', error_message: 'Không đọc được ID đánh giá đã lưu hoặc collector bị lỗi.' };
return [{ json: { business, upsert, response } }];
