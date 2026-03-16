import logging
from google.cloud import firestore
from backend.config.settings import settings
from google.adk.sessions import InMemorySessionService, Session

logger = logging.getLogger("chronicle.persistence")

class PersistenceService:
    def __init__(self):
        self.db = None
        self.collection = None
        self.init_error = None

        try:
            self.db = firestore.AsyncClient(project=settings.GOOGLE_CLOUD_PROJECT)
            self.collection = self.db.collection(settings.FIRESTORE_COLLECTION)
        except Exception as e:
            self.init_error = str(e)
            logger.error(f"Failed to initialize Firestore client: {e}")

    @property
    def is_available(self) -> bool:
        return self.collection is not None

    def health_status(self) -> dict:
        status = "ok" if self.is_available else "error"
        details = {
            "status": status,
            "project": settings.GOOGLE_CLOUD_PROJECT,
            "collection": settings.FIRESTORE_COLLECTION,
        }
        if self.init_error:
            details["error"] = self.init_error
        if not settings.GOOGLE_APPLICATION_CREDENTIALS:
            details["credentials_env"] = "GOOGLE_APPLICATION_CREDENTIALS not set"
        return details

    async def save_session_state(self, session_id: str, state: dict):
        """Persist the full ADK session state into Firestore."""
        if not self.collection:
            return
        
        try:
            doc_ref = self.collection.document(session_id)
            await doc_ref.set({"state": state})
            logger.debug(f"[{session_id}] State synced to Firestore.")
        except Exception as e:
            logger.error(f"[{session_id}] Error saving state to Firestore: {e}")

    async def load_session_state(self, session_id: str) -> dict:
        """Loads state from Firestore."""
        if not self.collection:
            return {}
        
        try:
            doc = await self.collection.document(session_id).get()
            if doc.exists:
                return doc.to_dict().get("state", {})
        except Exception as e:
            logger.error(f"[{session_id}] Error loading state from Firestore: {e}")
        return {}

    async def delete_session_state(self, session_id: str) -> None:
        if not self.collection:
            return
        try:
            await self.collection.document(session_id).delete()
        except Exception as e:
            logger.error(f"[{session_id}] Error deleting Firestore session: {e}")


# Global instance
_persistence_service = PersistenceService()

def get_persistence_service() -> PersistenceService:
    return _persistence_service


# We need to bridge ADK's InMemorySessionService with our PersistenceService manually
# because ADK's InMemorySessionService is what the Runner relies on.
async def hydrate_session(session_id: str, session_service: InMemorySessionService, app_name: str, user_id: str):
    """
    Loads state from Firestore and populates the InMemorySessionService.
    If the session doesn't exist in memory but exists in Firestore, it recreates it.
    """
    # 1. Load from Firestore
    persisted_state = await _persistence_service.load_session_state(session_id)
    if not persisted_state:
        return # Nothing to hydrate
    
    # 2. Check if it exists in memory
    memory_store = session_service.sessions.get(app_name, {}).get(user_id, {})
    stored_session = memory_store.get(session_id)
    
    if stored_session:
        # Just update the state
        stored_session.state.update(persisted_state)
        logger.info(f"[{session_id}] Hydrated existing in-memory session from Firestore.")
    else:
        # 3. Create a new session in memory with the state
        # In this implementation we don't restore full event history to memory,
        # but the state contains the pipeline_stage and all necessary variables to resume.
        session = Session(app_name=app_name, user_id=user_id, id=session_id, state=persisted_state)
        if app_name not in session_service.sessions:
            session_service.sessions[app_name] = {}
        if user_id not in session_service.sessions[app_name]:
            session_service.sessions[app_name][user_id] = {}
            
        session_service.sessions[app_name][user_id][session_id] = session
        logger.info(f"[{session_id}] Recreated in-memory session from Firestore state.")


async def persist_current_session(session_id: str, session_service: InMemorySessionService, app_name: str, user_id: str):
    """Persist the complete in-memory state for a session."""
    stored = session_service.sessions.get(app_name, {}).get(user_id, {}).get(session_id)
    if not stored:
        logger.error(f"[{session_id}] persist_current_session: session not found in InMemorySessionService")
        return

    await _persistence_service.save_session_state(session_id, dict(stored.state))


async def sync_state(session_id: str, updates: dict, session_service: InMemorySessionService, app_name: str, user_id: str):
    """
    Updates the in-memory session state AND pushes to Firestore.
    Replaces the previous _persist_session_state logic in routes.py.
    """
    # 1. Update in memory
    stored = session_service.sessions.get(app_name, {}).get(user_id, {}).get(session_id)
    if not stored:
        logger.error(f"[{session_id}] sync_state: session not found in InMemorySessionService")
        return
    
    for key, value in updates.items():
        stored.state[key] = value
        
    # 2. Push the full current state to Firestore so deletions persist too
    await _persistence_service.save_session_state(session_id, dict(stored.state))
    logger.info(f"[{session_id}] Session state synced to memory & Firestore: {list(updates.keys())}")
