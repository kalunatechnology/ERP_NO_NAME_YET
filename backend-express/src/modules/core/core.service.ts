import prisma from '../../config/database';

export class CoreService {
  static async getSidebarFeed(userId: string) {
    let notifications = await prisma.core_app_notification.findMany({
      where: { recipient_id: userId },
      orderBy: { created_at: 'desc' },
      take: 10,
    });

    if (notifications.length === 0) {
      notifications = await prisma.core_app_notification.findMany({
        orderBy: { created_at: 'desc' },
        take: 10,
      });
    }

    const [activities, contacts] = await Promise.all([
      prisma.core_activity_feed.findMany({
        orderBy: { created_at: 'desc' },
        take: 15,
      }),
      prisma.iam_user.findMany({
        where: {
          is_active: true,
          id: { not: userId },
          NOT: [
            { email: { contains: 'dummy' } },
            { email: { contains: 'demo' } },
            { email: { endsWith: '@example.com' } },
            { email: { endsWith: '@erp.local' } },
          ],
        },
        select: {
          id: true,
          email: true,
          full_name: true,
          username: true,
          status: true,
        },
        take: 20,
      }),
    ]);

    const actorIds = [
      ...notifications.map((n) => n.actor_id).filter((id): id is string => Boolean(id)),
      ...activities.map((a) => a.actor_id).filter((id): id is string => Boolean(id)),
    ];

    const actors = await prisma.iam_user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, full_name: true, username: true, email: true },
    });
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    const serializedNotifications = notifications.map((n) => ({
      ...n,
      actor: n.actor_id ? actorMap.get(n.actor_id) ?? null : null,
    }));

    const serializedActivities = activities.map((a) => ({
      ...a,
      actor: a.actor_id ? actorMap.get(a.actor_id) ?? null : null,
    }));

    return {
      notifications: serializedNotifications,
      activities: serializedActivities,
      contacts,
    };
  }

  static async markNotificationsRead(userId: string) {
    await prisma.core_app_notification.updateMany({
      where: { recipient_id: userId, is_read: false },
      data: { is_read: true },
    });
    return { status: 'all notifications marked as read' };
  }

  static async getRecentItems(userId: string) {
    return prisma.core_user_recent_item.findMany({
      where: { user_id: userId },
      orderBy: { last_accessed_at: 'desc' },
      take: 10,
    });
  }

  static async trackRecentItem(
    userId: string,
    data: { item_type: string; object_id: string; title: string; target_url: string },
  ) {
    const existing = await prisma.core_user_recent_item.findFirst({
      where: { user_id: userId, object_id: data.object_id },
    });

    if (existing) {
      return prisma.core_user_recent_item.update({
        where: { id: existing.id },
        data: {
          item_type: data.item_type,
          title: data.title,
          target_url: data.target_url,
          last_accessed_at: new Date(),
          updated_at: new Date(),
        },
      });
    }

    return prisma.core_user_recent_item.create({
      data: {
        id: crypto.randomUUID(),
        user_id: userId,
        item_type: data.item_type,
        object_id: data.object_id,
        title: data.title,
        target_url: data.target_url,
        last_accessed_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
  }
}
