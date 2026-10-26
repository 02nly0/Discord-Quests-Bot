/**
 * Types describing the undocumented quest payloads returned by
 * `GET /quests/@me`. Everything is optional on purpose: Discord ships
 * these shapes without any contract, so missing fields must degrade
 * gracefully instead of crashing the automation.
 */

export interface QuestPayload {
	id: string;
	config: QuestConfigPayload;
	user_status?: UserStatusPayload;
}

export interface QuestConfigPayload {
	application_id?: string;
	application?: ApplicationPayload;
	assets?: QuestAssetsPayload;
	colors?: QuestColorsPayload;
	messages?: QuestMessagesPayload;
	rewards_config?: RewardsConfigPayload;
	task_config?: TaskConfigPayload;
	task_config_v2?: TaskConfigPayload;
	cta_config?: CtaConfigPayload;
	starts_at?: string;
	expires_at?: string;
}

export interface QuestColorsPayload {
	primary?: string | number;
	secondary?: string | number;
}

export interface ApplicationPayload {
	id?: string;
	name?: string;
}

export interface QuestAssetsPayload {
	game_tile?: string;
	game_tile_light?: string;
	game_tile_dark?: string;
	hero?: string;
	hero_video?: string;
	quest_bar_hero?: string;
	logotype?: string;
	logotype_light?: string;
	logotype_dark?: string;
}

export interface CtaConfigPayload {
	link?: string;
	button_label?: string;
	subtitle?: string;
}

export interface QuestMessagesPayload {
	quest_name?: string;
	game_title?: string;
	game_publisher?: string;
}

export interface RewardsConfigPayload {
	rewards?: RewardPayload[];
	rewards_expire_at?: string;
}

export interface RewardPayload {
	id?: string;
	type?: number;
	asset?: string;
	asset_video?: string;
	orb_quantity?: number;
	premium_orb_quantity?: number;
	messages?: { name?: string; name_plural?: string };
}

export interface TaskConfigPayload {
	tasks?: Record<string, TaskDefinitionPayload>;
}

export interface TaskDefinitionPayload {
	target?: number;
	messages?: {
		task_title?: string;
		task_description?: string;
	};
}

export interface UserStatusPayload {
	enrolled_at?: string | null;
	completed_at?: string | null;
	claimed_at?: string | null;
	stream_progress_seconds?: number;
	progress?: Record<string, TaskProgressPayload>;
}

export interface TaskProgressPayload {
	value?: number;
	completed_at?: string | null;
}
