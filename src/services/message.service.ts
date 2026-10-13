import type { GroupMembership, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { badRequest, forbidden, notFound } from '../errors/AppError';
import type { ListMessagesQuery, SendMessageInput } from '../validation/message.schemas';

const withPeople = {
  sender: { select: { id: true, name: true } },
  recipients: { include: { user: { select: { id: true, name: true } } } },
} satisfies Prisma.MessageInclude;

type MessageWithPeople = Prisma.MessageGetPayload<{ include: typeof withPeople }>;

function toDto(message: MessageWithPeople, viewerId: number) {
  const sentByMe = message.senderId === viewerId;
  const myCopy = message.recipients.find((r) => r.userId === viewerId);
  return {
    id: message.id,
    content: message.content,
    toAll: message.toAll,
    createdAt: message.createdAt,
    direction: sentByMe ? ('sent' as const) : ('received' as const),
    sender: message.sender,
    // for a received message: did I open it already
    isRead: sentByMe ? null : myCopy?.readAt != null,
    // the list of recipients is shown only to the one who sent the message
    recipients: sentByMe
      ? message.recipients.map((r) => ({
          userId: r.user.id,
          name: r.user.name,
          readAt: r.readAt,
        }))
      : null,
  };
}

/** Who receives the message. A manager chooses; a regular member can write to the manager only. */
async function resolveRecipients(viewer: GroupMembership, input: SendMessageInput): Promise<number[]> {
  const { groupId, userId } = viewer;

  if (viewer.role !== 'manager') {
    if (input.toAll || (input.recipientIds && input.recipientIds.length > 0)) {
      throw forbidden('MANAGER_ONLY', 'חבר יכול לשלוח הודעות למנהל הקבוצה בלבד');
    }
    const manager = await prisma.groupMembership.findFirstOrThrow({
      where: { groupId, role: 'manager' },
    });
    return [manager.userId];
  }

  const others = await prisma.groupMembership.findMany({
    where: { groupId, isActive: true, userId: { not: userId } },
    select: { userId: true },
  });
  const otherIds = others.map((m) => m.userId);

  if (input.toAll) return otherIds;

  const chosen = [...new Set(input.recipientIds ?? [])];
  if (chosen.length === 0) {
    throw badRequest('RECIPIENTS_REQUIRED', 'יש לבחור נמענים או לשלוח לכולם');
  }
  if (chosen.some((id) => !otherIds.includes(id))) {
    throw badRequest('MEMBER_NOT_FOUND', 'אחד או יותר מהנמענים אינו חבר פעיל בקבוצה');
  }
  return chosen;
}

export async function sendMessage(viewer: GroupMembership, input: SendMessageInput) {
  const recipientIds = await resolveRecipients(viewer, input);

  const message = await prisma.message.create({
    data: {
      groupId: viewer.groupId,
      senderId: viewer.userId,
      content: input.content,
      toAll: viewer.role === 'manager' && input.toAll === true,
      recipients: { create: recipientIds.map((userId) => ({ userId })) },
    },
    include: withPeople,
  });
  return toDto(message, viewer.userId);
}

/** Only messages I sent or received - never other members' conversations. */
export async function listMessages(viewer: GroupMembership, query: ListMessagesQuery) {
  const { groupId, userId } = viewer;

  const received: Prisma.MessageWhereInput = {
    recipients: { some: query.unreadOnly ? { userId, readAt: null } : { userId } },
  };
  const sent: Prisma.MessageWhereInput = { senderId: userId };

  const where: Prisma.MessageWhereInput = { groupId };
  if (query.box === 'inbox' || query.unreadOnly) Object.assign(where, received);
  else if (query.box === 'sent') Object.assign(where, sent);
  else where.OR = [sent, received];

  const [messages, unreadCount] = await Promise.all([
    prisma.message.findMany({
      where,
      include: withPeople,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.messageRecipient.count({ where: { userId, readAt: null, message: { groupId } } }),
  ]);

  return { unreadCount, items: messages.map((m) => toDto(m, userId)) };
}

export async function markAsRead(viewer: GroupMembership, messageId: number) {
  const copy = await prisma.messageRecipient.findFirst({
    where: { messageId, userId: viewer.userId, message: { groupId: viewer.groupId } },
  });
  if (!copy) throw notFound('MESSAGE_NOT_FOUND', 'ההודעה לא נמצאה');

  if (!copy.readAt) {
    await prisma.messageRecipient.update({
      where: { messageId_userId: { messageId, userId: viewer.userId } },
      data: { readAt: new Date() },
    });
  }
}
