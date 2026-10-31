// lib/seed.js
// Development seed data generator for AASTU Events Hub.
// Safe to run repeatedly (idempotent).

import { db } from 'sdk';
import { eq } from 'sdk/db';
import { categories, clubs, events, admins } from '../schema.js';
import { nowSec } from './time.js';

export async function runSeed(actorId) {
  const now = nowSec();
  const logs = [];

  // 1. Categories
  const categoryDefs = [
    { name: 'Club Social', desc: 'Social gatherings, meetups, parties, and networking sessions.' },
    { name: 'Sports', desc: 'Tournaments, intramurals, fitness sessions, and outdoor activities.' },
    { name: 'Academic', desc: 'Lectures, seminars, research talks, and study sessions.' },
    { name: 'Entertainment', desc: 'Concerts, cultural nights, gaming, and performances.' },
    { name: 'Career/Workshop', desc: 'Skill-building bootcamps, resume reviews, hackathons, and career fairs.' },
    { name: 'Religious', desc: 'Fellowships, religious ceremonies, and faith-based community events.' },
    { name: 'Other', desc: 'Miscellaneous and interdisciplinary events.' },
  ];

  const catMap = new Map();
  for (const item of categoryDefs) {
    const existing = await db.select().from(categories).where(eq(categories.name, item.name)).get();
    if (!existing) {
      const created = await db.insert(categories).values({
        name: item.name,
        description: item.desc,
        createdAt: now,
      }).returning().run();
      catMap.set(item.name, created[0].id);
      logs.push(`+ Category: ${item.name}`);
    } else {
      catMap.set(item.name, existing.id);
    }
  }

  // 2. Clubs
  const clubDefs = [
    {
      name: 'AASTU Software Development Club',
      genre: 'Technology',
      contact: 'contact@aastucoding.org | TG: @aastu_devs',
    },
    {
      name: 'AASTU Robotics & AI Society',
      genre: 'Engineering',
      contact: 'robotics@aastu.edu.et | TG: @aastu_robotics',
    },
    {
      name: 'AASTU Athletics & Sports Guild',
      genre: 'Sports & Athletics',
      contact: 'sports@aastu.edu.et | TG: @aastu_sports',
    },
  ];

  const clubMap = new Map();
  for (const item of clubDefs) {
    const existing = await db.select().from(clubs).where(eq(clubs.name, item.name)).get();
    if (!existing) {
      const created = await db.insert(clubs).values({
        name: item.name,
        categoryType: item.genre,
        contactInfo: item.contact,
        createdAt: now,
        updatedAt: now,
      }).returning().run();
      clubMap.set(item.name, created[0].id);
      logs.push(`+ Club: ${item.name}`);
    } else {
      clubMap.set(item.name, existing.id);
    }
  }

  // 3. Sample Events
  const eventDefs = [
    {
      title: 'Annual AASTU Hackathon 2026 Opening Ceremony',
      clubName: 'AASTU Software Development Club',
      catName: 'Career/Workshop',
      startDeltaHours: 2,
      endDeltaHours: 6,
      location: 'ICT Center Block 508, Main Hall',
      status: 'approved',
      channelMessageId: 1042,
      approvedBy: 'Alex Superadmin',
      caption: '🚀 Get ready for AASTU Hackathon 2026! 24 hours of non-stop coding, mentorship, and epic prizes.',
      mediaType: 'text',
      isForwarded: false,
    },
    {
      title: 'Autonomous Drone Demo & Hands-on ROS2 Workshop',
      clubName: 'AASTU Robotics & AI Society',
      catName: 'Career/Workshop',
      startDeltaHours: 48,
      endDeltaHours: 52,
      location: 'Engineering Lab 3 & Main Stadium',
      status: 'approved',
      channelMessageId: 1043,
      approvedBy: 'Beth Moderating Admin',
      caption: '🤖 Join us for our live Autonomous Drone flight showcase and hands-on ROS2 workshop. Refreshments provided!',
      mediaType: 'text',
      isForwarded: false,
    },
    {
      title: 'Inter-Department Football Tournament Finals',
      clubName: 'AASTU Athletics & Sports Guild',
      catName: 'Sports',
      startDeltaHours: 72,
      endDeltaHours: 76,
      location: 'AASTU Central Sports Complex',
      status: 'approved',
      channelMessageId: 1044,
      approvedBy: 'Alex Superadmin',
      caption: '⚽ The climax of the semester sports calendar! Cheer on your department in the grand finals.',
      mediaType: 'text',
      isForwarded: false,
    },
    {
      title: 'Machine Learning for Embedded Systems Seminar',
      clubName: 'AASTU Software Development Club',
      catName: 'Academic',
      startDeltaHours: 96,
      endDeltaHours: 99,
      location: 'Auditorium Hall B',
      status: 'pending',
      channelMessageId: null,
      approvedBy: null,
      caption: 'Join international guest researchers exploring tinyML on microcontrollers.',
      mediaType: 'text',
      isForwarded: false,
    },
  ];

  for (const ev of eventDefs) {
    const existing = await db.select().from(events).where(eq(events.title, ev.title)).get();
    if (!existing) {
      await db.insert(events).values({
        title: ev.title,
        clubId: clubMap.get(ev.clubName) || null,
        categoryId: catMap.get(ev.catName) || null,
        startDatetime: now + ev.startDeltaHours * 3600,
        endDatetime: now + ev.endDeltaHours * 3600,
        location: ev.location,
        status: ev.status,
        channelMessageId: ev.channelMessageId,
        submittedAt: now,
        approvedAt: ev.status === 'approved' ? now : null,
        approvedBy: ev.approvedBy,
        recurring: false,
        rawContent: {
          media_type: ev.mediaType,
          file_ids: [],
          caption: ev.caption,
          is_forwarded: ev.isForwarded,
        },
      }).run();
      logs.push(`+ Event: ${ev.title} (${ev.status})`);
    }
  }

  return logs;
}
