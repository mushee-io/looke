import {NextResponse} from "next/server";
import {DM_SECURITY_GATES} from "../../../../../lib/experience/dm-envelope";
import {m5RequestsEnabled,M5_TRANSPORT_APPROVED,M5_KEY_REGISTRATION_APPROVED,M5_RECOVERY_AUDITED} from "../../../../../lib/experience/m5-message-safety";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** No plaintext messaging endpoint is enabled; readiness requires audit evidence. */
export function GET(){
 return NextResponse.json({
   milestone:"Final10 M5",mode:"foundation-only",transport:"disabled",
   requestMetadataConfigured:m5RequestsEnabled(),messageTransportApproved:M5_TRANSPORT_APPROVED,
   publicKeyRegistrationApproved:M5_KEY_REGISTRATION_APPROVED,
   multiDeviceRecoveryAudited:M5_RECOVERY_AUDITED,
   requestStorageSeparateFromMessages:true,
   nonceReplayRegistrySchemaOnly:true,
   ...DM_SECURITY_GATES,
   disclaimer:"Request metadata and offline envelope validation do not constitute audited end-to-end encryption, device recovery, or message delivery.",
   messagesSent:0,
 },{headers:{"cache-control":"no-store"}});
}
