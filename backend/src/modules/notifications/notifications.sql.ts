export const NOTIFICATION_COLUMNS_SQL = `
  id, user_id AS "userId", actor_id AS "actorId", type, title, message,
  entity_type AS "entityType", entity_id AS "entityId", metadata,
  is_read AS "isRead", read_at AS "readAt", action_url AS "actionUrl",
  created_at AS "createdAt"
`;

export const NOTIFICATION_PREFS_COLUMNS_SQL = `
  id, user_id AS "userId", telegram_chat_id AS "telegramChatId", phone_verified AS "phoneVerified",
  meeting_sms AS "meetingSms", meeting_telegram AS "meetingTelegram", meeting_email AS "meetingEmail",
  meeting_in_app AS "meetingInApp",
  task_sms AS "taskSms", task_telegram AS "taskTelegram", task_email AS "taskEmail",
  task_in_app AS "taskInApp",
  homework_sms AS "homeworkSms", homework_telegram AS "homeworkTelegram", homework_email AS "homeworkEmail",
  homework_in_app AS "homeworkInApp",
  payment_sms AS "paymentSms", payment_telegram AS "paymentTelegram", payment_email AS "paymentEmail",
  payment_in_app AS "paymentInApp",
  security_sms AS "securitySms", security_telegram AS "securityTelegram", security_email AS "securityEmail",
  security_in_app AS "securityInApp",
  course_telegram AS "courseTelegram", course_in_app AS "courseInApp",
  marketing_telegram AS "marketingTelegram", marketing_email AS "marketingEmail", marketing_in_app AS "marketingInApp",
  certificate_telegram AS "certificateTelegram", certificate_email AS "certificateEmail", certificate_in_app AS "certificateInApp",
  quiet_start AS "quietStart", quiet_end AS "quietEnd", updated_at AS "updatedAt"
`;

export const NOTIFICATION_DELIVERY_LOG_COLUMNS_SQL = `
  id, notification_id AS "notificationId", user_id AS "userId", channel,
  is_success AS "isSuccess", error_message AS "errorMessage", external_id AS "externalId",
  is_read_on_channel AS "isReadOnChannel", created_at AS "createdAt"
`;
