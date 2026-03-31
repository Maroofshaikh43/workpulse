import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { calculateDistanceMeters, formatLongDate, formatTime, getToday } from "../utils";

export default function Attendance() {
  const { supabase, profile, company } = useOutletContext();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [registeredPhotoUrl, setRegisteredPhotoUrl] = useState("");
  const [selfiePreview, setSelfiePreview] = useState("");
  const [location, setLocation] = useState(null);
  const [distance, setDistance] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);

  const attendanceRadius = company?.attendance_radius_meters ?? 200;
  const officeReady = useMemo(
    () =>
      company?.office_lat !== null &&
      company?.office_lng !== null &&
      company?.office_lat !== undefined &&
      company?.office_lng !== undefined,
    [company],
  );

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  const resetSelfie = () => {
    stopCamera();
    setSelfiePreview("");
  };

  const loadAttendancePage = async () => {
    const today = getToday();
    const [{ data: attendanceData, error: attendanceError }, { data: userData, error: userError }] = await Promise.all([
      supabase.from("attendance").select("*").eq("user_id", profile.id).eq("date", today).maybeSingle(),
      supabase.from("users").select("profile_photo_url").eq("id", profile.id).single(),
    ]);

    if (attendanceError) {
      setError(attendanceError.message);
      return;
    }

    if (userError) {
      setError(userError.message);
      return;
    }

    setTodayAttendance(attendanceData ?? null);
    setRegisteredPhotoUrl(userData?.profile_photo_url ?? "");
  };

  useEffect(() => {
    loadAttendancePage();
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOpen]);

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch (cameraError) {
      setError(
        cameraError?.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access to continue."
          : `Camera access failed: ${cameraError.message}`,
      );
    }
  };

  const captureSelfie = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const context = canvas.getContext("2d");
    context.drawImage(videoRef.current, 0, 0);
    setSelfiePreview(canvas.toDataURL("image/png"));
    stopCamera();
  };

  const verifyLocation = () => {
    setError("");
    setMessage("");
    resetSelfie();

    if (!registeredPhotoUrl) {
      setError("Please upload profile photo in Profile settings before checking in");
      return;
    }

    if (!officeReady) {
      setError("Admin must set the office GPS coordinates before attendance can be used.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        const nextDistance = calculateDistanceMeters(
          nextLocation.lat,
          nextLocation.lng,
          company.office_lat,
          company.office_lng,
        );

        setLocation(nextLocation);
        setDistance(nextDistance);

        if (nextDistance > attendanceRadius) {
          stopCamera();
          setError(`You are ${Math.round(nextDistance)} meters away. Move within ${attendanceRadius} meters to continue.`);
          return;
        }

        setMessage(`GPS verified within ${Math.round(nextDistance)} meters. Camera unlocked.`);
        await openCamera();
      },
      (geoError) => setError(`Location access failed: ${geoError.message}`),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleCheckIn = async () => {
    setError("");
    setMessage("");

    if (!registeredPhotoUrl) {
      setError("Please upload profile photo in Profile settings before checking in");
      return;
    }

    if (!location || distance === null || distance > attendanceRadius) {
      setError("Verify GPS successfully before checking in.");
      return;
    }

    if (!selfiePreview) {
      setError("Capture a live selfie after GPS verification.");
      return;
    }

    setLoading(true);
    setAction("checkin");
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    const status = time > "09:30:00" ? "late" : "present";

    const { error: insertError } = await supabase.from("attendance").upsert(
      {
        user_id: profile.id,
        company_id: profile.company_id,
        date: getToday(),
        check_in_time: time,
        location_lat: location.lat,
        location_lng: location.lng,
        face_verified: true,
        status,
      },
      { onConflict: "user_id,date" },
    );

    setLoading(false);
    setAction("");

    if (insertError) {
      setError(insertError.message);
      return;
    }

    resetSelfie();
    setMessage(`Attendance marked successfully at ${formatTime(time)}.`);
    loadAttendancePage();
  };

  const handleCheckOut = async () => {
    const { data: reportSubmission } = await supabase
      .from("daily_report_submissions")
      .select("id")
      .eq("user_id", profile.id)
      .eq("date", getToday())
      .maybeSingle();

    if (!reportSubmission) {
      setError("Complete today's daily report before checking out.");
      return;
    }

    setLoading(true);
    setAction("checkout");
    setError("");
    setMessage("");
    const now = new Date();
    const checkoutTime = now.toTimeString().slice(0, 8);
    const { error: updateError } = await supabase
      .from("attendance")
      .update({ check_out_time: checkoutTime })
      .eq("user_id", profile.id)
      .eq("date", getToday());
    setLoading(false);
    setAction("");
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage(`Check-out recorded successfully at ${formatTime(checkoutTime)}.`);
    loadAttendancePage();
  };

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="section-header">
          <h2>Attendance</h2>
          <p>{formatLongDate()}.</p>
        </div>
        {!!error && <div className="alert error">{error}</div>}
        {!!message && <div className="alert success">{message}</div>}
        <div className="stat-grid">
          <div className="stat-card">
            <span>Today</span>
            <strong>{todayAttendance?.status ?? "Not marked"}</strong>
          </div>
          <div className="stat-card">
            <span>Check In</span>
            <strong>{formatTime(todayAttendance?.check_in_time)}</strong>
          </div>
          <div className="stat-card">
            <span>Check Out</span>
            <strong>{formatTime(todayAttendance?.check_out_time)}</strong>
          </div>
          <div className="stat-card">
            <span>Allowed Radius</span>
            <strong>{attendanceRadius}m</strong>
          </div>
        </div>
      </div>

      <div className="grid-two responsive">
        <div className="panel">
          <div className="section-header">
            <h3>Step 1: GPS Verification</h3>
            <p>Verify your current location to unlock the selfie check-in flow.</p>
          </div>
          <div className="stack">
            <div className="mini-card">
              <strong>Today's Date</strong>
              <p>{formatLongDate()}</p>
            </div>
            <div className="mini-card">
              <strong>Your registered face</strong>
              {registeredPhotoUrl ? (
                <img src={registeredPhotoUrl} alt="Your registered face" className="photo-preview comparison-photo" />
              ) : (
                <p>Please upload profile photo in Profile settings before checking in</p>
              )}
            </div>
            <button type="button" className="primary-button" onClick={verifyLocation}>
              Verify GPS & Unlock Camera
            </button>
            {location && (
              <div className="mini-card">
                <p>
                  Current location: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                </p>
                {distance !== null && <p>Distance from office: {Math.round(distance)} meters</p>}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>Step 2: Face Comparison</h3>
            <p>Compare your registered photo with a live selfie before final check-in.</p>
          </div>

          {!cameraOpen && !selfiePreview && (
            <div className="empty-state">
              Camera stays locked until GPS verification succeeds inside the office radius.
            </div>
          )}

          {cameraOpen && (
            <div className="camera-card">
              <video ref={videoRef} autoPlay playsInline className="camera-view" />
              <div className="row-end">
                <button type="button" className="ghost-button" onClick={stopCamera}>
                  Cancel
                </button>
                <button type="button" className="primary-button" onClick={captureSelfie}>
                  Capture Selfie
                </button>
              </div>
            </div>
          )}

          {selfiePreview && (
            <div className="stack">
              <div className="comparison-grid">
                <div className="mini-card">
                  <strong>Registered</strong>
                  <img src={registeredPhotoUrl} alt="Registered photo" className="photo-preview comparison-photo" />
                </div>
                <div className="mini-card">
                  <strong>Live Selfie</strong>
                  <img src={selfiePreview} alt="Live selfie" className="photo-preview comparison-photo" />
                </div>
              </div>
              <div className="row-end">
                <button type="button" className="ghost-button" onClick={resetSelfie}>
                  Retake Selfie
                </button>
                <button type="button" className="success-button" onClick={handleCheckIn} disabled={loading}>
                  {loading && action === "checkin" ? "Saving..." : "Yes, it's me - Check In"}
                </button>
              </div>
            </div>
          )}

          <div className="row-end">
            <button
              type="button"
              className="ghost-button"
              onClick={handleCheckOut}
              disabled={loading || !todayAttendance?.check_in_time}
            >
              {loading && action === "checkout" ? "Checking out..." : "Check Out"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
