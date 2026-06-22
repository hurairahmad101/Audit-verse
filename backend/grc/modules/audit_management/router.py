from fastapi import APIRouter

from .routers.audit_universe import router as audit_universe_router
from .routers.audit_plans import router as audit_plans_router
from .routers.engagements import router as engagements_router
from .routers.workpapers import router as workpapers_router
from .routers.findings import router as findings_router
from .routers.ccm import router as ccm_router
from .routers.reporting import router as reporting_router
from .routers.qaip import router as qaip_router
from .routers.ai_agents import router as ai_agents_router
from .routers.test_scripts import router as test_scripts_router
from .routers.skill_matrix import router as skill_matrix_router
from .routers.capacity import router as capacity_router
from .routers.audit_tools import router as audit_tools_router
from .routers.notifications import router as notifications_router
from .routers.surveys import router as surveys_router
from .routers.documents import router as documents_router
from .routers.charter import router as charter_router
from .routers.external_portal import router as external_portal_router
from .routers.analytics import router as analytics_router
from .routers.issue_tracking import router as issue_tracking_router
from .routers.committee import router as committee_router
from .routers.tlod import router as tlod_router
from .routers.scoring import router as scoring_router

router = APIRouter(prefix="/audit", tags=["Audit Management"])

router.include_router(scoring_router)
router.include_router(audit_universe_router)
router.include_router(audit_plans_router)
router.include_router(engagements_router)
router.include_router(workpapers_router)
router.include_router(findings_router)
router.include_router(ccm_router)
router.include_router(reporting_router)
router.include_router(qaip_router)
router.include_router(ai_agents_router)
router.include_router(test_scripts_router)
router.include_router(capacity_router)
router.include_router(skill_matrix_router)
router.include_router(audit_tools_router)
router.include_router(notifications_router)
router.include_router(surveys_router)
router.include_router(documents_router)
router.include_router(charter_router)
router.include_router(external_portal_router)
router.include_router(analytics_router)
router.include_router(issue_tracking_router)
router.include_router(committee_router)
router.include_router(tlod_router)
