import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { calculateDistanceMeters, formatTime, getToday } from "../utils";

export default function Attendance() {
  const { supabase, profile, company } = useOutletContext();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState("");
  const [faceConfirmed, setFaceConfirmed] = useState(false);
  const [location, setLocation] = useState(null);
  const [distance, setDistance] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
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

  const loadTodayAttendance = async () => {
    const { data, error: attendanceError } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", profile.id)
      .eq("date", getToday())
      .maybeSingle();

    if (attendanceError) {
      setError(attendanceError.message);
      return;
    }

    setTodayAttendance(data ?? null);
  };

  useEffect(() => {
    loadTodayAttendance();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
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
      setError(`Camera access failed: ${cameraError.message}`);
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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  const verifyLocation = () => {
    setError("");
    setMessage("");
    setSelfiePreview("");
    setFaceConfirmed(false);

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
          setCameraOpen(false);
          setError(`You are ${Math.round(nextDistance)} meters away. Move within ${attendanceRadius} meters to continue.`);
          return;
        }

        setMessage(`GPS verified within ${Math.round(nextDistance)} meters. Camera unlocked.`);
        await openCamera();
      },
      (geoError) => setError(geoError.message),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleCheckIn = async () => {
    setError("");
    setMessage("");

    if (!location || distance === null || distance > attendanceRadius) {
      setError("Verify GPS successfully before checking in.");
      return;
    }
    if (!selfiePreview) {
      setError("Capture a selfie after GPS verification.");
      return;
    }
    if (!faceConfirmed) {
      setError("Please confirm the selfie matches your profile photo.");
      return;
    }

    setLoading(true);
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

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSelfiePreview("");
    setFaceConfirmed(false);
    setMessage("GPS and face verification passed. Attendance marked successfully.");
    loadTodayAttendance();
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
    setError("");
    setMessage("");
    const { error: updateError } = await supabase
      .from("attendance")
      .update({ check_out_time: new Date().toTimeString().slice(0, 8) })
      .eq("user_id", profile.id)
      .eq("date", getToday());
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage("Check-out recorded successfully.");
    loadTodayAttendance();
  };

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="section-header">
          <h2>Attendance</h2>
          <p>GPS must pass first. Only then does the live camera open for selfie confirmation.</p>
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
            <p>Camera access is withheld until your location falls inside the office radius.</p>
          </div>
          <div className="inline-list">
            <span>Office Latitude: {company?.office_lat ?? "Not set"}</span>
            <span>Office Longitude: {company?.office_lng ?? "Not set"}</span>
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

        <div className="panel">
          <div className="section-header">
            <h3>Step 2: Live Selfie Confirmation</h3>
            <p>After GPS passes, capture a live selfie, visually compare it, then discard it after check-in.</p>
          </div>
          {!cameraOpen && !selfiePreview && (
            <div className="empty-state">
              Camera stays locked until GPS verification succeeds inside the office radius.
            </div>
          )}
          {cameraOpen && (
            <div className="camera-card">
              <video ref={videoRef} autoPlay playsInline className="camera-view" />
              <button type="button" className="primary-button" onClick={captureSelfie}>
                Capture Selfie
              </button>
            </div>
          )}
          {selfiePreview && (
            <div className="capture-preview">
              <img src={selfiePreview} alt="Temporary selfie preview" className="photo-preview" />
              <img src={profile.profile_photo_url} alt="Stored profile reference" className="photo-preview" />
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={faceConfirmed}
                  onChange={(event) => setFaceConfirmed(event.target.checked)}
                />
                I confirm the live selfie matches my profile photo.
              </label>
            </div>
          )}
          <div className="row-end">
            <button type="button" className="primary-button" onClick={handleCheckIn} disabled={loading}>
              {loading ? "Saving..." : "Check In"}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={handleCheckOut}
              disabled={loading || !todayAttendance?.check_in_time}
            >
              Check Out
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
