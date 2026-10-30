import type { Language } from '../config';

export interface DashboardCopy {
	title: string;
	description: string;
	fields: Array<{ name: string; value: string; inline: boolean }>;
	footer: string;
	start: string;
	languageSwitch: string;
}

export const DASHBOARD_COPY: Record<Language, DashboardCopy> = {
	ar: {
		title: 'مهامك على الطيار الآلي',
		description:
			'اختر المهمة التي تريدها ودع البوت يتولى الباقي. استعرض المهام المتاحة، اطّلع على المكافأة، وتابع إنجازها دون مغادرة ديسكورد.\n\n' +
			'كل ما يظهر هنا خاص بجلستك، والتحديثات تصلك عبر الرسائل الخاصة.',
		fields: [
			{ name: 'تصفّح', value: 'صور المهام والمكافآت والتقدم لكل مهمة نشطة.', inline: true },
			{ name: 'أتمتة', value: 'أنجز مهمة واحدة أو جميع المهام المدعومة.', inline: true },
			{ name: 'ابقَ على اطلاع', value: 'رسائل عند اكتمال كل مهمة، وملخص عند انتهاء التشغيل.', inline: true },
		],
		footer: 'اضغط «ابدأ الآن» لفتح جلستك الخاصة',
		start: 'ابدأ الآن',
		languageSwitch: 'English version',
	},
	en: {
		title: 'Your quests, on autopilot',
		description:
			'Pick a quest and let the bot handle the rest. Browse what is available, check the reward, and watch it complete without leaving Discord.\n\n' +
			'Everything here is private to your session, and updates arrive in your DMs.',
		fields: [
			{ name: 'Browse', value: 'Art, rewards, and progress for every active quest.', inline: true },
			{ name: 'Automate', value: 'Run one quest or sweep every supported quest.', inline: true },
			{ name: 'Stay updated', value: 'Completion DMs and a final summary when the run ends.', inline: true },
		],
		footer: 'Press Get Started to open your private session',
		start: 'Get Started',
		languageSwitch: 'النسخة العربية',
	},
};
