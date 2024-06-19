import { readConfig } from "../../config";
import { UserError } from "../../errors";
import { getLegacyScriptName } from "../../index";
import { logger } from "../../logger";
import { printWranglerBanner } from "../../update-check";
import { requireAuth } from "../../user";
import type { VersionDetails } from ".";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";
import type { VersionCache } from "../types";
import { fetchDeploymentVersions, fetchLatestDeployment } from '../api';

export function versionsSecretsListOptions(yargs: CommonYargsArgv) {
	return yargs.option("name", {
		describe: "Name of the Worker",
		type: "string",
		requiresArg: true,
	});
}

export async function versionsSecretListHandler(
	args: StrictYargsOptionsToInterface<typeof versionsSecretsListOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args.config, args, false, true);

	const scriptName = getLegacyScriptName(args, config);
	if (!scriptName) {
		throw new UserError(
			"Required Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with `--name <worker-name>`"
		);
	}

	const accountId = await requireAuth(config);
	const versionCache: VersionCache = new Map();

	const latestDeployment = await fetchLatestDeployment(accountId, scriptName);
	const [versions, rollout] = await fetchDeploymentVersions(
		accountId,
		scriptName,
		latestDeployment,
		versionCache
	);

	for (const version of versions) {
		logger.log(
			`-- Version ${version.id} (${rollout.get(version.id)}%) secrets --`
		);

		const secrets = (version as VersionDetails).resources.bindings.filter(
			(binding) => binding.type === "secret_text"
		);
		for (const secret of secrets) {
			logger.log(`Secret Name: ${secret.name}`);
		}

		logger.log();
	}
}
