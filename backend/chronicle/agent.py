"""
ADK entry point for the Chronicle application.

Keeping the root agent instance in this package ensures ADK infers the same
app name as the FastAPI runner.
"""

from backend.agents.agent import ChronicleOrchestrator


class ChronicleRootAgent(ChronicleOrchestrator):
    """Root ADK agent bound to the chronicle package for app-name inference."""


root_agent = ChronicleRootAgent()
